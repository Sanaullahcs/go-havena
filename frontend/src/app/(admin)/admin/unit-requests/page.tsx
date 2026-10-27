"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, ExternalLink, FileText, Home, Mail, RefreshCw, X } from "lucide-react";
import { AdminBadge, DtPagination, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu, type AdminMenuAction } from "@/components/admin/admin-actions-menu";
import { PageLoader } from "@/components/shared/page-states";
import { TableLoadingOverlay } from "@/components/shared/loaders";
import { confirmAction, confirmRejectWithReason, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  approveUnitRegistrationPackage,
  fetchUnitRegistrationPackages,
  rejectUnitRegistrationPackage,
  type UnitRegistrationPackage,
} from "@/lib/api/property-services";

type StatusFilter = "pending" | "approved" | "rejected" | "all";
type KindFilter = "all" | "initial" | "addon";

const PAGE_SIZE = 6;

function kindLabel(kind: string) {
  return kind === "addon" ? "Add-on" : "Initial signup";
}

function statusTone(status: string): "amber" | "green" | "red" | "slate" {
  if (status === "pending") return "amber";
  if (status === "approved") return "green";
  if (status === "rejected") return "red";
  return "slate";
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

function proofLabel(kind: string) {
  return kind.replaceAll("_", " ");
}

export default function UnitRequestsPage() {
  const [rows, setRows] = useState<UnitRegistrationPackage[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [kind, setKind] = useState<KindFilter>("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<UnitRegistrationPackage | null>(null);
  const [reasonRow, setReasonRow] = useState<UnitRegistrationPackage | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setRefreshing(true);
    setError(null);
    try {
      const data = await fetchUnitRegistrationPackages({
        status: status === "all" ? undefined : status,
        kind: kind === "all" ? undefined : kind,
      });
      if (requestId !== requestRef.current) return;
      setRows(data);
      setViewing((current) => (current ? data.find((row) => row.id === current.id) ?? null : null));
      setReasonRow((current) => (current ? data.find((row) => row.id === current.id) ?? current : null));
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(apiError(err));
    } finally {
      if (requestId === requestRef.current) {
        setRefreshing(false);
        setInitialLoading(false);
      }
    }
  }, [kind, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, kind]);

  const stats = useMemo(() => {
    const pending = rows.filter((row) => row.status === "pending").length;
    const initial = rows.filter((row) => row.kind === "initial").length;
    const addon = rows.filter((row) => row.kind === "addon").length;
    return { total: rows.length, pending, initial, addon };
  }, [rows]);

  const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, lastPage);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, safePage]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function applyStatus(next: StatusFilter) {
    if (next === status) return;
    setStatus(next);
  }

  function applyKind(next: KindFilter) {
    if (next === kind) return;
    setKind(next);
  }

  async function refreshList() {
    await load();
  }

  function rowActions(row: UnitRegistrationPackage): AdminMenuAction[] {
    const viewAction: AdminMenuAction = {
      label: "View",
      icon: "view",
      onClick: () => setViewing(row),
    };

    if (row.status === "pending") {
      return [
        {
          label: busyId === row.id ? "Working…" : "Approve",
          icon: "approve",
          tone: "primary",
          onClick: () => void approve(row),
        },
        {
          label: "Reject",
          icon: "reject",
          tone: "danger",
          onClick: () => void reject(row),
        },
        viewAction,
      ];
    }

    if (row.status === "rejected") {
      return [
        viewAction,
        {
          label: "Rejection reason",
          icon: "reject",
          tone: "danger",
          onClick: () => setReasonRow(row),
        },
      ];
    }

    return [viewAction];
  }

  async function approve(row: UnitRegistrationPackage) {
    const confirmed = await confirmAction({
      title: `Approve ${kindLabel(row.kind).toLowerCase()} request?`,
      text: `${row.resident_name || "Resident"} — ${row.unit_count} unit${row.unit_count === 1 ? "" : "s"}. All units in this package will be activated.`,
      confirmText: "Approve",
      color: "blue",
    });
    if (!confirmed.isConfirmed) return;

    setBusyId(row.id);
    try {
      await approveUnitRegistrationPackage(row.id);
      toastSuccess("Unit registration approved.");
      setViewing(null);
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(row: UnitRegistrationPackage) {
    const result = await confirmRejectWithReason({
      title: `Reject ${kindLabel(row.kind).toLowerCase()} request?`,
      text: row.kind === "addon"
        ? "The resident keeps access to their existing units."
        : "The resident will stay on Pending Approval until they resubmit.",
      confirmText: "Reject",
    });
    if (!result.isConfirmed || !result.value) return;

    setBusyId(row.id);
    try {
      await rejectUnitRegistrationPackage(row.id, String(result.value));
      toastSuccess("Unit registration rejected.");
      setViewing(null);
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (initialLoading) return <PageLoader text="Loading unit requests…" />;

  return (
    <div className="space-y-6">
      <div>
        <p className="nl-eyebrow">Property</p>
        <h1 className="nl-page-title">Unit Requests</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-slate-500">
          Review self-signup unit packages and add-on unit requests. Approve or reject the entire package in one action.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Showing" value={String(stats.total)} hint="Current filter" tone="blue" icon={<Home className="h-4 w-4" />} />
        <StatTile label="Pending" value={String(stats.pending)} hint="Needs review" tone="amber" icon={<RefreshCw className="h-4 w-4" />} />
        <StatTile label="Initial" value={String(stats.initial)} hint="Self-signup packages" tone="slate" icon={<Check className="h-4 w-4" />} />
        <StatTile label="Add-on" value={String(stats.addon)} hint="Extra unit requests" tone="slate" icon={<Check className="h-4 w-4" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              applyStatus(value);
            }}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold capitalize transition ${
              status === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {value === "all" ? "All statuses" : value}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:inline-block" />
        {(["all", "initial", "addon"] as KindFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              applyKind(value);
            }}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              kind === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {value === "all" ? "All kinds" : kindLabel(value)}
          </button>
        ))}
        <button
          type="button"
          disabled={refreshing}
          onClick={(event) => {
            event.preventDefault();
            void refreshList();
          }}
          className="nl-btn-secondary ml-auto disabled:cursor-wait disabled:opacity-70"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {refreshing ? <TableLoadingOverlay minHeight="10rem" /> : null}
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
              <Home className="h-5 w-5" />
            </div>
            <p className="mt-3 text-[15px] font-semibold text-slate-900">No unit requests</p>
            <p className="mt-1 text-[13px] text-slate-500">
              Nothing matches this filter. Try another status or refresh the list.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {pageRows.map((row) => (
                <div key={row.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8F1FA] text-[13px] font-bold text-[#1B4F8A]">
                    {initials(row.resident_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[14.5px] font-semibold text-slate-900">
                        {row.resident_name || "Resident"}
                      </p>
                      <AdminBadge tone={statusTone(row.status)}>{row.status}</AdminBadge>
                      <span className="rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[11px] font-semibold text-[#0F766E]">
                        {kindLabel(row.kind)}
                      </span>
                    </div>
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-slate-500">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{row.resident_email || "No email"}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {row.units.length > 0 ? (
                        row.units.map((unit) => (
                          <span
                            key={unit.id}
                            className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700"
                          >
                            {unit.unit_number}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11.5px] text-slate-400">
                          {row.unit_count} unit{row.unit_count === 1 ? "" : "s"}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatWhen(row.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <AdminActionsMenu actions={rowActions(row)} />
                  </div>
                </div>
              ))}
            </div>
            <DtPagination
              showing={pageRows.length}
              total={rows.length}
              page={safePage}
              lastPage={lastPage}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {viewing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewing(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unit-request-title"
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8F1FA] text-[13px] font-bold text-[#1B4F8A]">
                {initials(viewing.resident_name)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="unit-request-title" className="truncate text-[16px] font-bold text-slate-900">
                  {viewing.resident_name || "Resident"}
                </h3>
                <p className="mt-0.5 truncate text-[12.5px] text-slate-500">
                  {viewing.resident_email || "No email"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <AdminBadge tone={statusTone(viewing.status)}>{viewing.status}</AdminBadge>
                  <span className="rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[11px] font-semibold text-[#0F766E]">
                    {kindLabel(viewing.kind)}
                  </span>
                  <span className="text-[11.5px] text-slate-400">{formatWhen(viewing.created_at)}</span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setViewing(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto px-5 py-4">
              {viewing.units.map((unit) => (
                <div key={unit.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#1B4F8A] shadow-sm ring-1 ring-slate-200">
                        <Home className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-mono text-[15px] font-bold text-slate-900">{unit.unit_number}</p>
                        <p className="text-[11.5px] text-slate-500">
                          {unit.is_new_unit ? "New unit" : "Existing unit"}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold capitalize text-slate-600 ring-1 ring-slate-200">
                      {unit.residence_type || "Not set"}
                    </span>
                  </div>
                  {unit.proofs.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {unit.proofs.map((proof) => (
                        <a
                          key={proof.id}
                          href={proof.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold capitalize text-[#1B4F8A] ring-1 ring-slate-200 hover:bg-[#E8F1FA]"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {proofLabel(proof.kind)}
                          <ExternalLink className="h-3 w-3 text-slate-400" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-[12px] text-slate-400">No proof files attached.</p>
                  )}
                </div>
              ))}
            </div>
            {viewing.status === "pending" ? (
              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                <button type="button" className="nl-btn-secondary" onClick={() => void reject(viewing)} disabled={busyId === viewing.id}>
                  Reject
                </button>
                <button type="button" className="nl-btn-primary" onClick={() => void approve(viewing)} disabled={busyId === viewing.id}>
                  {busyId === viewing.id ? "Working…" : "Approve"}
                </button>
              </div>
            ) : (
              <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                <button type="button" className="nl-btn-secondary" onClick={() => setViewing(null)}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {reasonRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReasonRow(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rejection-reason-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-2xl"
          >
            <div className="flex items-start gap-3 border-b border-rose-100 bg-rose-50/80 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[12px] font-bold text-rose-700 ring-1 ring-rose-100">
                {initials(reasonRow.resident_name)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="rejection-reason-title" className="text-[15px] font-bold text-slate-900">
                  Rejection reason
                </h3>
                <p className="mt-0.5 truncate text-[12.5px] text-slate-500">
                  {reasonRow.resident_name || "Resident"} · {kindLabel(reasonRow.kind)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-600"
                onClick={() => setReasonRow(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              {reasonRow.units.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {reasonRow.units.map((unit) => (
                    <span
                      key={unit.id}
                      className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700"
                    >
                      {unit.unit_number}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="whitespace-pre-wrap rounded-xl bg-rose-50 px-3.5 py-3 text-[13.5px] leading-relaxed text-rose-900 ring-1 ring-rose-100">
                {reasonRow.rejection_reason?.trim() || "No reason was recorded."}
              </p>
            </div>
            <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-4">
              <button type="button" className="nl-btn-secondary" onClick={() => setReasonRow(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
