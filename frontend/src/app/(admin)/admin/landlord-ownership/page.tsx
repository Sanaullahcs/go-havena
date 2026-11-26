"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Building2, Check, Clock, CreditCard, ExternalLink, FileText, Users, X } from "lucide-react";
import { AdminBadge, DataTable, DtCell, DtHead, DtPagination, DtRow, DtTable, StatTile } from "@/components/admin/ui";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { AdminActionsMenu, type AdminMenuAction } from "@/components/admin/admin-actions-menu";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { ThemedSelect } from "@/components/ui/themed-select";
import { confirmAction, confirmRejectWithReason, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  approveAdminLandlordClaim,
  fetchAdminLandlordClaim,
  fetchAdminLandlordClaims,
  occupancyLabel,
  rejectAdminLandlordClaim,
  type AdminOwnershipClaim,
  type AdminOwnershipClaimDetail,
} from "@/lib/api/landlord";

type StatusFilter = "pending" | "approved" | "rejected" | "all";
type OccupancyFilter = "all" | "vacant" | "rented";

function statusTone(status: string): "amber" | "green" | "red" | "slate" {
  if (status === "pending") return "amber";
  if (status === "approved") return "green";
  if (status === "rejected") return "red";
  return "slate";
}

function residentColumnLabel(row: AdminOwnershipClaim): string {
  if (row.occupancy === "vacant") return "Currently no resident";
  const total = row.resident_counts?.total ?? 0;
  const active = row.resident_counts?.active ?? 0;
  const pending = row.resident_counts?.pending ?? 0;
  const count = total > 0 ? total : active + pending;
  if (count === 0) return "No residents yet";
  if (count === 1) return "1 resident";
  return `${count} residents`;
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initials(name?: string | null) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

function sourceLabel(source?: string | null) {
  if (!source) return "Unknown";
  if (source === "become_landlord") return "My Properties claim";
  if (source === "signup") return "Signup package";
  return source.replaceAll("_", " ");
}

export default function AdminLandlordOwnershipPage() {
  const [rows, setRows] = useState<AdminOwnershipClaim[]>([]);
  const [summaryRows, setSummaryRows] = useState<AdminOwnershipClaim[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [occupancyFilter, setOccupancyFilter] = useState<OccupancyFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<AdminOwnershipClaimDetail | null>(null);
  const listRequestRef = useRef(0);

  const stats = useMemo(() => {
    const pending = summaryRows.filter((row) => row.status === "pending").length;
    const approved = summaryRows.filter((row) => row.status === "approved").length;
    const rejected = summaryRows.filter((row) => row.status === "rejected").length;
    return { total: summaryRows.length, pending, approved, rejected };
  }, [summaryRows]);

  const loadSummary = useCallback(async () => {
    const data = await fetchAdminLandlordClaims("all");
    setSummaryRows(data);
    return data;
  }, []);

  const loadList = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    setRefreshing(true);
    setError(null);
    try {
      const data = await fetchAdminLandlordClaims(status);
      if (requestId !== listRequestRef.current) return;
      setRows(data);
      setViewing((current) => {
        if (!current) return null;
        const refreshed = data.find((row) => row.id === current.id);
        return refreshed ? { ...current, ...refreshed } : null;
      });
    } catch (err) {
      if (requestId !== listRequestRef.current) return;
      setError(apiError(err));
    } finally {
      if (requestId === listRequestRef.current) {
        setRefreshing(false);
        setInitialLoading(false);
      }
    }
  }, [status]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await Promise.all([loadSummary(), loadList()]);
    } catch (err) {
      setError(apiError(err));
    }
  }, [loadList, loadSummary]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (occupancyFilter !== "all") {
      list = list.filter((row) => row.occupancy === occupancyFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) => {
      const haystack = [
        row.unit_number,
        row.display_name,
        row.email,
        row.phone,
        row.occupancy,
        row.status,
        row.billing_contact?.name,
        row.billing_contact?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, occupancyFilter]);

  useEffect(() => {
    setPage(1);
  }, [status, occupancyFilter, search]);

  const lastPage = Math.max(1, Math.ceil(filteredRows.length / ADMIN_TABLE_PAGE_SIZE));
  const safePage = Math.min(page, lastPage);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * ADMIN_TABLE_PAGE_SIZE;
    return filteredRows.slice(start, start + ADMIN_TABLE_PAGE_SIZE);
  }, [filteredRows, safePage]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const tableFilters = useMemo(
    () => [
      { key: "all" as const, label: "All", count: stats.total },
      { key: "approved" as const, label: "Approved", count: stats.approved },
      { key: "rejected" as const, label: "Rejected", count: stats.rejected },
      { key: "pending" as const, label: "Pending", count: stats.pending },
    ],
    [stats],
  );

  async function openDetail(row: AdminOwnershipClaim) {
    try {
      const detail = await fetchAdminLandlordClaim(row.id);
      setViewing(detail);
    } catch (err) {
      setViewing(row);
      toastError(apiError(err));
    }
  }

  async function approveRow(row: AdminOwnershipClaim | AdminOwnershipClaimDetail) {
    const ok = await confirmAction({
      title: `Approve claim for unit ${row.unit_number}?`,
      text: `${occupancyLabel(row.occupancy)} · ${row.display_name || row.email}`,
      confirmText: "Approve",
      color: "green",
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await approveAdminLandlordClaim(row.id);
      toastSuccess("Ownership approved.");
      setViewing(null);
      await Promise.all([loadSummary(), loadList()]);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function rejectRow(row: AdminOwnershipClaim | AdminOwnershipClaimDetail) {
    const reason = await confirmRejectWithReason({
      title: `Reject claim for unit ${row.unit_number}?`,
      text: "The resident will stay without landlord approval on this unit.",
      confirmText: "Reject",
    });
    if (reason === false) return;
    setBusyId(row.id);
    try {
      await rejectAdminLandlordClaim(row.id, typeof reason === "string" ? reason : undefined);
      toastSuccess("Ownership rejected.");
      setViewing(null);
      await Promise.all([loadSummary(), loadList()]);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  function rowActions(row: AdminOwnershipClaim): AdminMenuAction[] {
    const actions: AdminMenuAction[] = [
      { id: "view", label: "View details", icon: "view", onClick: () => void openDetail(row) },
    ];
    if (row.status === "pending") {
      actions.push(
        {
          id: "approve",
          label: "Approve",
          icon: "approve",
          tone: "success",
          onClick: () => void approveRow(row),
          disabled: busyId === row.id,
        },
        {
          id: "reject",
          label: "Reject",
          icon: "reject",
          tone: "danger",
          onClick: () => void rejectRow(row),
          disabled: busyId === row.id,
        },
      );
    }
    return actions;
  }

  if (initialLoading) return <PageLoader label="Loading landlord claims…" />;

  return (
    <div className="space-y-6">
      <div>
        <p className="nl-eyebrow">Property</p>
        <h1 className="nl-page-title font-bold">Landlord Claims</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-slate-500">
          Vacant and rented-out ownership from <strong>My Properties</strong>.{" "}
          <em>I live here</em> claims belong in{" "}
          <Link href="/admin/unit-requests" className="font-semibold text-[#1B4F8A] hover:underline">
            Unit Requests
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total claims" value={String(stats.total)} hint="All time in this community" tone="blue" icon={<Building2 className="h-4 w-4" />} />
        <StatTile label="Pending" value={String(stats.pending)} hint="Needs review" tone="amber" icon={<Clock className="h-4 w-4" />} />
        <StatTile label="Approved" value={String(stats.approved)} hint="Landlord tools active" tone="green" icon={<Check className="h-4 w-4" />} />
        <StatTile label="Rejected" value={String(stats.rejected)} hint="Declined claims" tone="red" icon={<X className="h-4 w-4" />} />
      </div>

      <DataTable
        title="Claims queue"
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search unit, member, email…"
        searchDisabled={Boolean(viewing)}
        loading={refreshing}
        beforeSearch={
          <OccupancyToolbarFilter
            value={occupancyFilter}
            disabled={Boolean(viewing)}
            onChange={setOccupancyFilter}
          />
        }
        filters={tableFilters}
        activeFilter={status}
        onFilter={(key) => setStatus(key)}
        isEmpty={filteredRows.length === 0}
        empty="No landlord claims match this filter."
      >
        <DtTable>
          <DtHead
            cols={[
              { label: "Member" },
              { label: "Unit" },
              { label: "Occupancy" },
              { label: "Status" },
              { label: "Billing contact" },
              { label: "Residents" },
              { label: "Submitted" },
              { label: "Actions", right: true },
            ]}
          />
          <tbody>
            {pageRows.map((row) => (
              <DtRow key={row.id} onClick={() => void openDetail(row)}>
                <DtCell first>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F1FA] text-[11px] font-bold text-[#1B4F8A]">
                      {initials(row.display_name || row.email)}
                    </span>
                    <div className="min-w-[11rem]">
                      <p className="font-semibold leading-tight text-slate-900">{row.display_name || "Resident"}</p>
                      <p className="mt-0.5 whitespace-nowrap text-[11.5px] leading-tight text-slate-500">{row.email}</p>
                    </div>
                  </div>
                </DtCell>
                <DtCell nowrap>
                  <span className="font-mono text-[14px] font-bold text-[#1B4F8A]">{row.unit_number}</span>
                </DtCell>
                <DtCell>
                  <AdminBadge tone="blue">{occupancyLabel(row.occupancy)}</AdminBadge>
                </DtCell>
                <DtCell>
                  <AdminBadge tone={statusTone(row.status)}>{row.status}</AdminBadge>
                </DtCell>
                <DtCell>
                  {row.billing_contact ? (
                    <div className="min-w-[10.5rem]">
                      <p className="font-semibold leading-tight text-slate-900">{row.billing_contact.name}</p>
                      {row.billing_contact.email ? (
                        <p className="mt-0.5 whitespace-nowrap text-[11.5px] leading-tight text-slate-500">
                          {row.billing_contact.email}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[12.5px] text-slate-400">Not assigned</span>
                  )}
                </DtCell>
                <DtCell>
                  <span
                    className={
                      row.occupancy === "vacant"
                        ? "text-[12.5px] italic text-slate-400"
                        : "text-[13px] font-medium text-slate-800"
                    }
                  >
                    {residentColumnLabel(row)}
                  </span>
                </DtCell>
                <DtCell nowrap muted>
                  {formatWhen(row.created_at)}
                </DtCell>
                <DtCell last right>
                  <div
                    className="flex justify-end"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    role="presentation"
                  >
                    <AdminActionsMenu actions={rowActions(row)} disabled={busyId === row.id} />
                  </div>
                </DtCell>
              </DtRow>
            ))}
          </tbody>
        </DtTable>
        <DtPagination
          showing={pageRows.length}
          total={filteredRows.length}
          page={safePage}
          lastPage={lastPage}
          onPageChange={setPage}
          pageSize={ADMIN_TABLE_PAGE_SIZE}
        />
      </DataTable>

      {error ? <PageError message={error} onRetry={() => void refreshAll()} /> : null}

      {viewing ? (
        <LandlordClaimDetailDialog
          claim={viewing}
          busy={busyId === viewing.id}
          onClose={() => setViewing(null)}
          onApprove={() => void approveRow(viewing)}
          onReject={() => void rejectRow(viewing)}
        />
      ) : null}
    </div>
  );
}

function OccupancyToolbarFilter({
  value,
  onChange,
  disabled,
}: {
  value: OccupancyFilter;
  onChange: (value: OccupancyFilter) => void;
  disabled?: boolean;
}) {
  const active = value !== "all";

  return (
    <div
      className={[
        "flex h-8 shrink-0 items-stretch overflow-hidden rounded-lg border text-[12.5px] transition",
        active
          ? "border-[#1B4F8A]/30 bg-gradient-to-b from-[#F8FBFF] to-white shadow-sm ring-1 ring-[#E8F1FA]"
          : "border-slate-200 bg-slate-50 shadow-sm",
        disabled ? "pointer-events-none opacity-60" : "hover:border-slate-300",
      ].join(" ")}
    >
      <span className="flex items-center gap-1.5 border-r border-slate-200/90 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-[#1B4F8A]" aria-hidden />
        <span className="hidden sm:inline">Occupancy</span>
      </span>
      <ThemedSelect
        compact
        className="nl-toolbar-select min-w-[7.25rem] max-w-[9rem]"
        value={value}
        placeholder="All"
        options={[
          { value: "all", label: "All" },
          { value: "vacant", label: "Vacant" },
          { value: "rented", label: "Rented out" },
        ]}
        onChange={(next) => onChange(next as OccupancyFilter)}
        disabled={disabled}
      />
    </div>
  );
}

function residentStatusLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "pending") return "Pending approval";
  return status;
}

function claimBillingDisplay(claim: AdminOwnershipClaimDetail) {
  const billing = claim.unit?.billing_contact ?? claim.billing_contact;
  const name = billing?.name ?? claim.display_name ?? claim.claimant?.display_name ?? null;
  const email = billing?.email ?? claim.email ?? claim.claimant?.email ?? null;
  let hint = email;
  if (!hint) {
    if (claim.occupancy === "vacant" && name) {
      hint = "Owner pays bills while vacant";
    } else if (name) {
      hint = "No email on file";
    } else {
      hint = "No billing contact on file";
    }
  }
  return { name: name ?? "—", hint };
}

function detailResidentHeadline(claim: AdminOwnershipClaimDetail, counts: { active: number; pending: number; total: number }): string {
  if (claim.occupancy === "vacant") return "Currently no resident";
  const n = counts.total || counts.active + counts.pending;
  if (n === 0) return "No residents yet";
  if (n === 1) return "1 member on unit";
  return `${n} members on unit`;
}

function LandlordClaimDetailDialog({
  claim,
  busy,
  onClose,
  onApprove,
  onReject,
}: {
  claim: AdminOwnershipClaimDetail;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const unit = claim.unit;
  const counts = unit?.resident_counts ?? { active: 0, pending: 0, total: 0 };
  const residents = unit?.residents ?? [];
  const billingDisplay = claimBillingDisplay(claim);
  const claimantName = claim.display_name || claim.claimant?.display_name || "Resident";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="landlord-claim-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-12px_rgba(15,23,42,0.22)]"
      >
        <header className="border-b border-slate-100 px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium tracking-wide text-slate-400">Landlord ownership claim</p>
              <h3 id="landlord-claim-title" className="mt-0.5 font-mono text-[1.65rem] font-bold leading-tight text-slate-900">
                Unit {claim.unit_number}
              </h3>
              <p className="mt-1 text-[13px] text-slate-500">
                <span className="font-medium text-slate-700">{claimantName}</span>
                <span className="text-slate-300"> · </span>
                <span className="capitalize text-slate-500">{unit?.kind ?? "residential"}</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <AdminBadge tone={statusTone(claim.status)}>{claim.status}</AdminBadge>
                <AdminBadge tone="blue">{occupancyLabel(claim.occupancy)}</AdminBadge>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">{sourceLabel(claim.source)}</span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex items-stretch gap-5 border-b border-slate-100 bg-slate-50/40 px-5 py-3.5">
          <ClaimDialogStat
            className="min-w-0 flex-1"
            icon={<Users className="h-4 w-4" />}
            label="Residents"
            value={claim.occupancy === "vacant" ? "0" : String(counts.total)}
            hint={detailResidentHeadline(claim, counts)}
          />
          <div className="w-px shrink-0 self-stretch bg-slate-100" aria-hidden />
          <ClaimDialogStat
            className="min-w-0 flex-1"
            icon={<CreditCard className="h-4 w-4" />}
            label="Billing contact"
            value={billingDisplay.name}
            hint={billingDisplay.hint}
            truncateValue
            truncateHint
          />
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="text-[13px] font-semibold text-slate-900">Unit members</h4>
              <span className="text-[11.5px] text-slate-400">{detailResidentHeadline(claim, counts)}</span>
            </div>
            {residents.length > 0 ? (
              <ul className="space-y-1">
                {residents.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F1FA] text-[11px] font-bold text-[#1B4F8A]">
                        {initials(person.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-slate-900">{person.name}</p>
                        <p className="truncate text-[11px] text-slate-400">{person.email || "—"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <AdminBadge tone={person.status === "active" ? "green" : "amber"}>{residentStatusLabel(person.status)}</AdminBadge>
                      {person.is_billing_contact ? (
                        <span className="text-[10px] font-semibold text-emerald-600">Billing</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-[12.5px] leading-relaxed text-slate-500">
                {claim.occupancy === "vacant" ? "Currently no resident on this vacant unit." : "No residents linked yet."}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-100 bg-white">
            <h4 className="border-b border-slate-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Claimant</h4>
            <dl className="divide-y divide-slate-50 text-[13px]">
              <DetailRow label="Email" value={claim.email || claim.claimant?.email || "—"} />
              <DetailRow label="Phone" value={claim.phone || claim.claimant?.phone || "—"} />
              <DetailRow label="Submitted" value={formatWhen(claim.created_at)} />
              {claim.reviewed_at ? (
                <DetailRow
                  label="Reviewed"
                  value={`${formatWhen(claim.reviewed_at)}${claim.reviewed_by_name ? ` · ${claim.reviewed_by_name}` : ""}`}
                />
              ) : null}
            </dl>
          </section>

          {claim.proof_url ? (
            <a
              href={claim.proof_url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-[13px] font-medium text-[#1B4F8A] transition hover:border-[#1B4F8A]/30 hover:bg-[#E8F1FA]/40"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400 group-hover:text-[#1B4F8A]" />
                View ownership proof
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-300 group-hover:text-[#1B4F8A]" />
            </a>
          ) : null}

          {claim.rejection_reason ? (
            <div className="rounded-xl border border-red-100 bg-red-50/60 px-4 py-3">
              <p className="text-[11px] font-semibold text-red-600">Rejection reason</p>
              <p className="mt-1 text-[13px] leading-relaxed text-red-900">{claim.rejection_reason}</p>
            </div>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          {claim.status === "pending" ? (
            <>
              <button type="button" className="nl-btn-secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="nl-btn-secondary text-red-600 hover:bg-red-50" onClick={onReject} disabled={busy}>
                Reject
              </button>
              <button type="button" className="nl-btn-primary" onClick={onApprove} disabled={busy}>
                {busy ? "Working…" : "Approve"}
              </button>
            </>
          ) : (
            <button type="button" className="nl-btn-secondary" onClick={onClose}>
              Close
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function ClaimDialogStat({
  className,
  icon,
  label,
  value,
  hint,
  truncateValue,
  truncateHint,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  truncateValue?: boolean;
  truncateHint?: boolean;
}) {
  return (
    <div className={className ?? "min-w-0"}>
      <div className="flex items-center gap-1.5 text-slate-400">
        <span className="text-[#1B4F8A]/70">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-1 text-[15px] font-bold text-slate-900 ${truncateValue ? "truncate" : ""}`}>{value}</p>
      <p className={`mt-0.5 text-[11px] text-slate-500 ${truncateHint ? "truncate" : ""}`}>{hint}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}