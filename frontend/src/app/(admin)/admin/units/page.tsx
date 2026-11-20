"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, Home, Plus, UserRound, Users, X } from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import {
  AdminBadge,
  DataTable,
  DtCell,
  DtHead,
  DtPagination,
  DtRow,
  DtTable,
  StatTile,
} from "@/components/admin/ui";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminClientTableBusy, isAdminSearchPending } from "@/lib/admin/table-loading";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  createAdminUnit,
  deleteAdminUnit,
  fetchAdminUnits,
  transferUnitBillingContact,
  type CommunityUnit,
} from "@/lib/api/property-services";
import {
  adminUnitNumberDuplicateError,
  adminUnitNumberLengthError,
  ADMIN_UNIT_NUMBER_MAX,
} from "@/lib/admin/unit-number";

type ContactFilter = "all" | "assigned" | "missing";

const UNIT_CONTACT_FILTERS: { key: ContactFilter; label: string }[] = [
  { key: "all", label: "All units" },
  { key: "assigned", label: "Has billing contact" },
  { key: "missing", label: "No billing contact" },
];

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

function formatShortDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

  const lastPage = Math.max(1, Math.ceil(deferredFilteredUnits.length / ADMIN_TABLE_PAGE_SIZE));

  const pagedUnits = useMemo(() => {
    const start = (page - 1) * ADMIN_TABLE_PAGE_SIZE;
    return deferredFilteredUnits.slice(start, start + ADMIN_TABLE_PAGE_SIZE);
  }, [deferredFilteredUnits, page]);

  const existingResidentialUnitNumbers = useMemo(
    () => residentialUnits.map((unit) => unit.unit_number),
    [residentialUnits],
  );

  const unitNumberFieldError = useMemo(() => {
    if (!creating) return null;
    return (
      adminUnitNumberLengthError(unitNumber)
      ?? adminUnitNumberDuplicateError(unitNumber, existingResidentialUnitNumbers)
    );
  }, [creating, unitNumber, existingResidentialUnitNumbers]);

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
    setPage(Math.floor(index / ADMIN_TABLE_PAGE_SIZE) + 1);
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

    const fieldError =
      adminUnitNumberLengthError(unitNumber)
      ?? adminUnitNumberDuplicateError(unitNumber, existingResidentialUnitNumbers);
    if (fieldError) return;

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
        <StatTile
          label="Residential units"
          value={String(stats.total)}
          hint="Homes in your community"
          icon={<Home className="h-4 w-4" />}
        />
        <StatTile
          label="Missing billing contact"
          value={String(stats.missing)}
          hint="Units without a designated payer"
          icon={<UserRound className="h-4 w-4" />}
          tone="amber"
        />
        <StatTile
          label="Assigned residents"
          value={String(stats.residents)}
          hint="Residents linked to a unit"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

        <DataTable
          title="All units"
          titleCount={deferredFilteredUnits.length}
          search={searchInput}
          onSearch={(value) => startTransition(() => {
            setSearchInput(value);
            setPage(1);
          })}
          searchPlaceholder="Search by unit, resident, or billing contact…"
          searchClassName="sm:!w-[320px]"
          searchDisabled={creating}
          searching={isAdminSearchPending(searchInput, debouncedSearch)}
          loading={adminClientTableBusy(
            isPending,
            isDeferredPending,
            searchInput,
            debouncedSearch,
            saving,
            transferringBusy,
            deletingId !== null,
          )}
          filters={UNIT_CONTACT_FILTERS}
          activeFilter={contactFilter}
          onFilter={(key) => startTransition(() => {
            setContactFilter(key as ContactFilter);
            setPage(1);
          })}
          isEmpty={deferredFilteredUnits.length === 0}
          empty={
            contactFilter !== "all" && !debouncedSearch.trim()
              ? `No units with ${contactFilterLabel(contactFilter).toLowerCase()}.`
              : "No units match your search or filters."
          }
          contained
          intro={
            highlightedId ? (() => {
              const highlighted = residentialUnits.find((unit) => unit.id === highlightedId);
              if (!highlighted) return null;
              return (
                <div
                  className={`rounded-xl px-4 py-3 text-sm ${
                    highlighted.billing_contact ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {highlighted.billing_contact
                    ? `Unit ${highlighted.unit_number} now has a billing contact: ${highlighted.billing_contact.name}.`
                    : `Unit ${highlighted.unit_number} still has no billing contact.`}
                </div>
              );
            })() : null
          }
        >
          <DtTable contained>
            <DtHead
              cols={[
                { label: "Unit" },
                { label: "Billing contact" },
                { label: "Status" },
                { label: "Residents" },
                { label: "Last updated" },
                { label: "Actions", right: true },
              ]}
            />
            <tbody>
              {pagedUnits.map((unit) => {
                const hasContact = Boolean(unit.billing_contact?.name);
                const residents = unit.residents ?? [];
                const lastUpdated = unit.updated_at ?? unit.created_at;
                const canDelete = unitCanDelete(unit);
                return (
                  <DtRow
                    key={unit.id}
                    className={highlightedId === unit.id ? "bg-emerald-50/60" : undefined}
                  >
                    <DtCell first>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1B4F8A]/10 text-[#1B4F8A]">
                          <Home className="h-4 w-4" aria-hidden />
                        </span>
                        <p className="truncate font-semibold text-slate-900">{unit.unit_number}</p>
                      </div>
                    </DtCell>
                    <DtCell>
                      {hasContact ? (
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{unit.billing_contact!.name}</p>
                          <p className="truncate text-xs text-slate-500">Designated payer</p>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <p className="font-medium text-amber-800">Not assigned</p>
                          <p className="text-xs text-amber-700/80">No billing contact</p>
                        </div>
                      )}
                    </DtCell>
                    <DtCell>
                      <AdminBadge tone={unit.status === "active" ? "green" : "slate"}>
                        {unit.status === "active" ? "Active" : unit.status}
                      </AdminBadge>
                    </DtCell>
                    <DtCell>
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        <span className="font-semibold tabular-nums">{unit.resident_count ?? residents.length}</span>
                      </span>
                    </DtCell>
                    <DtCell>
                      <div className="min-w-0">
                        <p className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                          {formatShortDate(lastUpdated)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {hasContact ? "Billing contact assigned" : "Awaiting billing contact"}
                        </p>
                      </div>
                    </DtCell>
                    <DtCell right>
                      <AdminActionsMenu
                        actions={[
                          { label: "View details", icon: "view", onClick: () => setViewing(unit) },
                          {
                            label: "Change billing contact",
                            icon: "edit",
                            onClick: () => openTransfer(unit),
                            disabled: residents.length === 0,
                          },
                          {
                            label: deletingId === unit.id ? "Deleting…" : "Delete unit",
                            icon: "delete",
                            tone: "danger",
                            onClick: () => void handleDelete(unit),
                            hidden: !canDelete,
                            disabled: deletingId === unit.id,
                          },
                        ]}
                      />
                    </DtCell>
                  </DtRow>
                );
              })}
            </tbody>
          </DtTable>
          <DtPagination
            showing={pagedUnits.length}
            total={deferredFilteredUnits.length}
            page={page}
            lastPage={lastPage}
            pageSize={ADMIN_TABLE_PAGE_SIZE}
            onPageChange={(nextPage) => startTransition(() => setPage(nextPage))}
          />
        </DataTable>
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
                  maxLength={ADMIN_UNIT_NUMBER_MAX}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  aria-invalid={unitNumberFieldError ? true : undefined}
                  aria-describedby={unitNumberFieldError ? "unit-number-error" : undefined}
                  className={[
                    "nl-input mt-1.5",
                    unitNumberFieldError ? "border-red-300 ring-1 ring-red-100 focus:border-red-400 focus:ring-red-100" : "",
                  ].join(" ")}
                  placeholder="4B"
                  disabled={saving}
                />
              </label>
              {unitNumberFieldError ? (
                <p id="unit-number-error" className="mt-1.5 text-xs text-red-600" role="alert">
                  {unitNumberFieldError}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">
                  Up to {ADMIN_UNIT_NUMBER_MAX} characters.
                </p>
              )}
            </form>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeCreate} disabled={saving} className="nl-btn-secondary w-full sm:w-auto">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !unitNumber.trim() || Boolean(unitNumberFieldError)}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-50 pb-2 last:border-0 sm:flex-row sm:gap-3">
      <span className="w-full shrink-0 text-[12px] font-semibold text-slate-500 sm:w-36">{label}</span>
      <span className="min-w-0 text-[13px] text-slate-800 break-words">{value}</span>
    </div>
  );
}
