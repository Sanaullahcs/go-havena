"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Building2, Home, Plus, UserRound, Users, X } from "lucide-react";
import { NL } from "@/lib/design-tokens";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { AdminBadge, DtPagination, StatTile } from "@/components/admin/ui";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { TableLoadingOverlay, TableProgressBar } from "@/components/shared/loaders";
import { ThemedSelect } from "@/components/ui/themed-select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminClientTableBusy } from "@/lib/admin/table-loading";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  createAdminUnit,
  deleteAdminUnit,
  fetchAdminUnits,
  transferUnitBillingContact,
  type CommunityUnit,
} from "@/lib/api/property-services";
import { DUPLICATE_UNIT_MESSAGE, normalizeUnitNumber } from "@/lib/admin/unit-number";

const UNITS_PAGE_SIZE = 6;

type ContactFilter = "all" | "assigned" | "missing";

const CONTACT_FILTERS: ContactFilter[] = ["all", "assigned", "missing"];

function contactFilterLabel(filter: ContactFilter) {
  if (filter === "all") return "All units";
  if (filter === "assigned") return "Has billing contact";
  return "No billing contact";
}

function hasBillingContact(unit: CommunityUnit) {
  return Boolean(unit.billing_contact_user_id || unit.billing_contact?.name);
}

function matchesContactFilter(unit: CommunityUnit, filter: ContactFilter) {
  if (filter === "all") return true;
  if (filter === "assigned") return hasBillingContact(unit);
  return !hasBillingContact(unit);
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function AdminUnitsPage() {
  const [units, setUnits] = useState<CommunityUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [unitNumber, setUnitNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<CommunityUnit | null>(null);
  const [transferring, setTransferring] = useState<CommunityUnit | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [transferringBusy, setTransferringBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const searchParams = useSearchParams();
  const focusUnit = searchParams.get("unit") ?? searchParams.get("unitNumber") ?? "";

  async function load() {
    try {
      setError(null);
      const rows = await fetchAdminUnits();
      setUnits(rows);
      setViewing((current) => current ? rows.find((unit) => unit.id === current.id) ?? current : null);
      setTransferring((current) => current ? rows.find((unit) => unit.id === current.id) ?? current : null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const residentialUnits = useMemo(
    () => units.filter((unit) => unit.kind !== "office"),
    [units],
  );

  const contactOptions = useMemo(
    () => CONTACT_FILTERS.map((filter) => {
      const count = residentialUnits.filter((unit) => matchesContactFilter(unit, filter)).length;
      return {
        value: filter,
        label: count > 0 ? `${contactFilterLabel(filter)} (${count})` : contactFilterLabel(filter),
      };
    }),
    [residentialUnits],
  );

  const filteredUnits = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return residentialUnits.filter((unit) => {
      if (!matchesContactFilter(unit, contactFilter)) return false;
      if (!query) return true;
      const haystack = [
        unit.unit_number,
        unit.billing_contact?.name,
        ...(unit.residents ?? []).map((resident) => resident.name),
        ...(unit.residents ?? []).map((resident) => resident.email),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [residentialUnits, contactFilter, debouncedSearch]);

  const deferredFilteredUnits = useDeferredValue(filteredUnits);
  const isDeferredPending = deferredFilteredUnits !== filteredUnits;
  const tableBusy = adminClientTableBusy(isPending, isDeferredPending, searchInput, debouncedSearch, saving, transferringBusy);

  const lastPage = Math.max(1, Math.ceil(deferredFilteredUnits.length / UNITS_PAGE_SIZE));

  const pagedUnits = useMemo(() => {
    const start = (page - 1) * UNITS_PAGE_SIZE;
    return deferredFilteredUnits.slice(start, start + UNITS_PAGE_SIZE);
  }, [deferredFilteredUnits, page]);

  const stats = useMemo(() => {
    const residential = units.filter((unit) => unit.kind === "residential");
    return {
      total: residential.length,
      missing: residential.filter((unit) => !unit.billing_contact_user_id).length,
      residents: units.reduce((sum, unit) => sum + (unit.resident_count ?? 0), 0),
    };
  }, [units]);

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  useEffect(() => {
    if (!focusUnit || residentialUnits.length === 0) return;
    const index = residentialUnits.findIndex((unit) => (
      String(unit.id) === focusUnit || String(unit.unit_number).toLowerCase() === focusUnit.toLowerCase()
    ));
    if (index < 0) return;
    setHighlightedId(residentialUnits[index].id);
    setPage(Math.floor(index / UNITS_PAGE_SIZE) + 1);
  }, [focusUnit, residentialUnits]);

  function openCreate() {
    setUnitNumber("");
    setCreating(true);
  }

  function closeCreate() {
    if (saving) return;
    setCreating(false);
    setUnitNumber("");
  }

  async function handleCreate() {
    const trimmed = unitNumber.trim();
    if (!trimmed) return;

    const normalized = normalizeUnitNumber(trimmed);
    const duplicate = residentialUnits.some(
      (unit) => normalizeUnitNumber(unit.unit_number) === normalized,
    );
    if (duplicate) {
      toastError(DUPLICATE_UNIT_MESSAGE);
      return;
    }

    setSaving(true);
    try {
      await createAdminUnit({ unit_number: trimmed });
      toastSuccess("Unit created.");
      setCreating(false);
      setUnitNumber("");
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  function openTransfer(unit: CommunityUnit) {
    setSelectedContactId(unit.billing_contact_user_id);
    setTransferring(unit);
  }

  function unitCanDelete(unit: CommunityUnit) {
    return unit.kind !== "office" && (unit.resident_count ?? 0) === 0;
  }

  async function handleDelete(unit: CommunityUnit) {
    if (!unitCanDelete(unit) || deletingId) return;

    const ok = await confirmAction({
      title: "Delete unit?",
      text: `Unit <strong>${unit.unit_number}</strong> will be removed from the community. This cannot be undone.`,
      confirmText: "Delete unit",
      icon: "warning",
      color: "red",
    });
    if (!ok.isConfirmed) return;

    setDeletingId(unit.id);
    try {
      await deleteAdminUnit(unit.id);
      toastSuccess("Unit deleted.");
      if (viewing?.id === unit.id) setViewing(null);
      if (highlightedId === unit.id) setHighlightedId(null);
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTransfer() {
    if (!transferring || !selectedContactId) return;
    if (selectedContactId === transferring.billing_contact_user_id) {
      setTransferring(null);
      return;
    }
    const resident = (transferring.residents ?? []).find((item) => item.id === selectedContactId);
    const ok = await confirmAction({
      title: "Change billing contact?",
      text: `${resident?.name || "This resident"} will be the only person who receives unit service bills and notifications.`,
      confirmText: "Transfer",
    });
    if (!ok) return;
    setTransferringBusy(true);
    try {
      await transferUnitBillingContact(transferring.id, selectedContactId);
      toastSuccess("Billing contact updated.");
      setTransferring(null);
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setTransferringBusy(false);
    }
  }

  if (loading) return <PageLoader />;
  if (error) return <PageError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Services billing</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Units</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Manage unit numbers and billing contacts for service bills.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="nl-btn-primary shrink-0">
          <Plus className="h-4 w-4" />
          Add unit
        </button>
      </div>

      {residentialUnits.length > 0 ? (
        <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Residential units" value={String(stats.total)} icon={<Home className="h-4 w-4" />} />
        <StatTile label="Missing billing contact" value={String(stats.missing)} icon={<UserRound className="h-4 w-4" />} tone="amber" />
        <StatTile label="Assigned residents" value={String(stats.residents)} icon={<Users className="h-4 w-4" />} />
      </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-[#F6F8FB] to-[#E8F0F7]/40 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1B4F8A] text-white shadow-sm">
                <Building2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">All units</p>
                <p className="text-xs text-slate-500">
                  {deferredFilteredUnits.length}/{residentialUnits.length} shown
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <ClearableInput
                  type="text"
                  placeholder="Search by unit, resident…"
                  value={searchInput}
                  hideClear={tableBusy}
                  onChange={(event) => startTransition(() => {
                    setSearchInput(event.target.value);
                    setPage(1);
                  })}
                  className="h-8 w-52 rounded-lg border border-slate-200 bg-white py-1.5 pr-8 text-[12.5px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  style={{ paddingLeft: "1.875rem" }}
                />
                {tableBusy ? (
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                    <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                  </span>
                ) : null}
              </div>
              <div className="nl-picker-compact w-[196px]">
                <ThemedSelect
                  value={contactFilter}
                  onChange={(value) => startTransition(() => {
                    setContactFilter(value as ContactFilter);
                    setPage(1);
                  })}
                  options={contactOptions}
                  placeholder="All units"
                />
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1B4F8A] ring-1 ring-[#1B4F8A]/15">
                Page {page} of {lastPage}
              </span>
            </div>
          </div>

          {highlightedId ? (() => {
            const highlighted = residentialUnits.find((unit) => unit.id === highlightedId);
            if (!highlighted) return null;
            return (
              <div className={`mx-5 mt-4 rounded-xl px-4 py-3 text-sm ${highlighted.billing_contact ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                {highlighted.billing_contact
                  ? `Unit ${highlighted.unit_number} now has a billing contact: ${highlighted.billing_contact.name}.`
                  : `Unit ${highlighted.unit_number} still has no billing contact.`}
              </div>
            );
          })() : null}

          <div className="relative" aria-busy={tableBusy || undefined}>
            {tableBusy ? (
              deferredFilteredUnits.length === 0 ? (
                <div className="relative flex min-h-[16rem] flex-col items-center justify-center py-16">
                  <TableProgressBar />
                </div>
              ) : (
                <TableLoadingOverlay />
              )
            ) : null}
            {deferredFilteredUnits.length === 0 ? (
              tableBusy ? null : (
                <div className="px-5 py-14 text-center">
                  <p className="text-sm font-medium text-slate-500">
                    {contactFilter !== "all" && !debouncedSearch.trim()
                      ? `No units with ${contactFilterLabel(contactFilter).toLowerCase()}.`
                      : "No units match your search or filters."}
                  </p>
                </div>
              )
            ) : (
              <div className={tableBusy ? "pointer-events-none select-none opacity-55 transition-opacity duration-150" : "transition-opacity duration-150"}>
                <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                  {pagedUnits.map((unit, index) => (
                    <UnitCard
                      key={unit.id}
                      unit={unit}
                      index={index}
                      highlighted={highlightedId === unit.id}
                      canDelete={unitCanDelete(unit)}
                      deleting={deletingId === unit.id}
                      onView={() => setViewing(unit)}
                      onTransfer={() => openTransfer(unit)}
                      onDelete={() => void handleDelete(unit)}
                    />
                  ))}
                </div>

                <div className="border-t border-slate-200/60 bg-white/70">
                  <DtPagination
                    showing={pagedUnits.length}
                    total={deferredFilteredUnits.length}
                    page={page}
                    lastPage={lastPage}
                    pageSize={UNITS_PAGE_SIZE}
                    onPageChange={(nextPage) => startTransition(() => setPage(nextPage))}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
        </>
      ) : null}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">New unit</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Add unit</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Enter the unit number residents will select during profile setup.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCreate}
                  disabled={saving}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <form
              className="px-6 py-5"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreate();
              }}
            >
              <label className="block text-sm font-medium text-slate-700">
                Unit number <span className="text-red-500">*</span>
                <ClearableInput
                  autoFocus
                  required
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  className="nl-input mt-1.5"
                  placeholder="4B"
                  disabled={saving}
                />
              </label>
            </form>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeCreate} disabled={saving} className="nl-btn-secondary w-full sm:w-auto">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !unitNumber.trim()}
                onClick={() => void handleCreate()}
                className="nl-btn-primary w-full sm:w-auto disabled:opacity-50"
              >
                {saving ? "Adding…" : "Add unit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminBadge tone={viewing.kind === "office" ? "slate" : "blue"}>{viewing.kind}</AdminBadge>
                    <AdminBadge tone={viewing.status === "active" ? "green" : "slate"}>{viewing.status}</AdminBadge>
                  </div>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">Unit {viewing.unit_number}</h3>
                  <p className="text-sm text-slate-500">
                    {viewing.resident_count} resident{viewing.resident_count === 1 ? "" : "s"}
                  </p>
                </div>
                <button type="button" onClick={() => setViewing(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="space-y-3">
                <DetailRow label="Billing contact" value={viewing.billing_contact?.name || "None assigned"} />
                <DetailRow label="Created" value={formatWhen(viewing.created_at)} />
                <DetailRow label="Updated" value={formatWhen(viewing.updated_at)} />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Residents</p>
                {(viewing.residents ?? []).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No residents are assigned to this unit yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {(viewing.residents ?? [])
                      .filter((resident) => !resident.is_billing_contact)
                      .map((resident) => (
                        <div key={resident.id} className="rounded-xl border border-slate-100 px-3 py-2">
                          <p className="text-sm font-semibold text-slate-900">{resident.name}</p>
                          {resident.email ? <p className="text-xs text-slate-500">{resident.email}</p> : null}
                          {resident.joined_at ? <p className="text-xs text-slate-400">Joined {formatWhen(resident.joined_at)}</p> : null}
                        </div>
                      ))}
                    {(viewing.residents ?? []).filter((resident) => !resident.is_billing_contact).length === 0
                      && (viewing.residents ?? []).length > 0 ? (
                        <p className="text-sm text-slate-500">Only the billing contact is assigned to this unit.</p>
                      ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end">
              {unitCanDelete(viewing) ? (
                <button
                  type="button"
                  disabled={deletingId === viewing.id}
                  onClick={() => void handleDelete(viewing)}
                  className="nl-btn-secondary w-full border-red-200 text-red-700 hover:bg-red-50 sm:mr-auto sm:w-auto"
                >
                  {deletingId === viewing.id ? "Deleting…" : "Delete unit"}
                </button>
              ) : null}
              <button type="button" onClick={() => setViewing(null)} className="nl-btn-secondary w-full sm:w-auto">Close</button>
              <button
                type="button"
                disabled={(viewing.residents ?? []).length === 0}
                onClick={() => {
                  openTransfer(viewing);
                  setViewing(null);
                }}
                className="nl-btn-primary w-full sm:w-auto"
              >
                Change billing contact
              </button>
            </div>
          </div>
        </div>
      )}

      {transferring && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Unit {transferring.unit_number}</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">Change billing contact</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Only this resident receives unit service bills and notifications.
                  </p>
                </div>
                <button type="button" onClick={() => setTransferring(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-6 py-5">
              {(transferring.residents ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Assign a resident to this unit before choosing a billing contact.</p>
              ) : (
                (transferring.residents ?? []).map((resident) => {
                  const selected = selectedContactId === resident.id;
                  return (
                    <label
                      key={resident.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 ${
                        selected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <ClearableInput
                        type="radio"
                        name="billing-contact"
                        className="mt-1"
                        checked={selected}
                        onChange={() => setSelectedContactId(resident.id)}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{resident.name}</span>
                        {resident.email ? <span className="block text-xs text-slate-500">{resident.email}</span> : null}
                        {resident.is_billing_contact ? (
                          <span className="mt-1 inline-block text-xs font-semibold text-emerald-700">Current billing contact</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setTransferring(null)} className="nl-btn-secondary w-full sm:w-auto">Cancel</button>
              <button
                type="button"
                disabled={
                  transferringBusy
                  || !selectedContactId
                  || selectedContactId === transferring.billing_contact_user_id
                }
                onClick={() => void handleTransfer()}
                className="nl-btn-primary w-full sm:w-auto"
              >
                {transferringBusy ? "Saving…" : "Save contact"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

const UNIT_CARD_BLOBS = [
  "bg-[#1B4F8A]/10",
  "bg-emerald-500/10",
  "bg-violet-500/10",
  "bg-sky-500/10",
  "bg-rose-500/10",
  "bg-amber-500/10",
] as const;

function UnitCard({
  unit,
  index,
  highlighted = false,
  canDelete = false,
  deleting = false,
  onView,
  onTransfer,
  onDelete,
}: {
  unit: CommunityUnit;
  index: number;
  highlighted?: boolean;
  canDelete?: boolean;
  deleting?: boolean;
  onView: () => void;
  onTransfer: () => void;
  onDelete: () => void;
}) {
  const hasContact = Boolean(unit.billing_contact?.name);
  const residents = unit.residents ?? [];
  const blobAccent = UNIT_CARD_BLOBS[index % UNIT_CARD_BLOBS.length];

  return (
    <article
      className={`group relative flex h-full min-h-[168px] flex-col overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
        highlighted
          ? "ring-2 ring-emerald-400"
          : hasContact
            ? "ring-slate-200/80 hover:ring-[#1B4F8A]/25"
            : "ring-amber-200/80 hover:ring-amber-300/60"
      }`}
    >
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl ${blobAccent}`} aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#1B4F8A]/20 to-transparent"
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Unit</p>
          <h2 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {unit.unit_number}
          </h2>
        </div>
        <div className="rounded-xl bg-white/90 opacity-90 shadow-sm ring-1 ring-slate-100 transition-opacity group-hover:opacity-100">
          <AdminActionsMenu
            actions={[
              { label: "View details", icon: "view", onClick: onView },
              {
                label: "Change billing contact",
                icon: "edit",
                onClick: onTransfer,
                disabled: residents.length === 0,
              },
              {
                label: deleting ? "Deleting…" : "Delete unit",
                icon: "delete",
                tone: "danger",
                onClick: onDelete,
                hidden: !canDelete,
                disabled: deleting,
              },
            ]}
          />
        </div>
      </div>

      <div className="relative mt-auto pt-5">
        {hasContact ? (
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-3 shadow-inner">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                style={{ background: NL.fillCta }}
              >
                {initials(unit.billing_contact!.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Billing contact
                </p>
                <p className="truncate text-sm font-bold text-slate-900">{unit.billing_contact!.name}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Active
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-amber-200 bg-gradient-to-br from-amber-50/90 to-orange-50/40 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700/80">
                  Billing contact
                </p>
                <p className="text-sm font-semibold text-amber-900">Not assigned</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-50 pb-2 last:border-0 sm:flex-row sm:gap-3">
      <span className="w-full shrink-0 text-[12px] font-semibold text-slate-500 sm:w-36">{label}</span>
      <span className="min-w-0 text-[13px] text-slate-800 break-words">{value}</span>
    </div>
  );
}
