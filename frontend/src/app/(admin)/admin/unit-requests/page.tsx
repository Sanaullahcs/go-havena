"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Home, RefreshCw, X } from "lucide-react";
import { AdminBadge, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { MemberUnitsLabel } from "@/components/admin/member-units-label";
import { PageError, PageLoader } from "@/components/shared/page-states";
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
  return date.toLocaleString();
}

export default function UnitRequestsPage() {
  const [rows, setRows] = useState<UnitRegistrationPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [kind, setKind] = useState<KindFilter>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<UnitRegistrationPackage | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchUnitRegistrationPackages({
        status: status === "all" ? undefined : status,
        kind: kind === "all" ? undefined : kind,
      });
      setRows(data);
      setViewing((current) => (current ? data.find((row) => row.id === current.id) ?? current : null));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending").length;
    const initial = rows.filter((r) => r.kind === "initial").length;
    const addon = rows.filter((r) => r.kind === "addon").length;
    return { total: rows.length, pending, initial, addon };
  }, [rows]);

  async function approve(row: UnitRegistrationPackage) {
    const confirmed = await confirmAction({
      title: `Approve ${kindLabel(row.kind).toLowerCase()} request?`,
      text: `${row.resident_name || "Resident"} — ${row.unit_count} unit${row.unit_count === 1 ? "" : "s"}. All units in this package will be activated.`,
      confirmText: "Approve all",
      color: "blue",
    });
    if (!confirmed.isConfirmed) return;

    setBusyId(row.id);
    try {
      await approveUnitRegistrationPackage(row.id);
      toastSuccess("Unit registration approved.");
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
      await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading && rows.length === 0) return <PageLoader label="Loading unit requests…" />;
  if (error && rows.length === 0) return <PageError message={error} onRetry={() => void load()} />;

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
            onClick={() => setStatus(value)}
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
            onClick={() => setKind(value)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              kind === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {value === "all" ? "All kinds" : kindLabel(value)}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="nl-btn-secondary ml-auto">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[15px] font-semibold text-slate-900">No unit requests</p>
            <p className="mt-1 text-[13px] text-slate-500">
              Self-signup packages and add-on requests will appear here for review.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-semibold text-slate-900">
                      {row.resident_name || "Resident"}
                    </p>
                    <AdminBadge tone={statusTone(row.status)}>{row.status}</AdminBadge>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {kindLabel(row.kind)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-slate-500">
                    {row.resident_email || "No email"} ·{" "}
                    <MemberUnitsLabel
                      units={row.units}
                      variant={row.unit_count > 1 ? "inline" : "table"}
                      empty={`${row.unit_count} unit${row.unit_count === 1 ? "" : "s"}`}
                    />
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-slate-400">Submitted {formatWhen(row.created_at)}</p>
                  {row.rejection_reason ? (
                    <p className="mt-1 text-[12px] text-red-600">Reason: {row.rejection_reason}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button type="button" className="nl-btn-secondary" onClick={() => setViewing(row)}>
                    View
                  </button>
                  {row.status === "pending" ? (
                    <AdminActionsMenu
                      actions={[
                        {
                          label: busyId === row.id ? "Working…" : "Approve all",
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
                      ]}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">{viewing.resident_name || "Resident"}</h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">
                  {kindLabel(viewing.kind)} · {viewing.status}
                </p>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setViewing(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              {viewing.units.map((unit) => (
                <div key={unit.id} className="rounded-xl border border-slate-150 bg-slate-50/80 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[13px] font-semibold text-slate-900">{unit.unit_number}</p>
                    <span className="text-[11px] font-medium text-slate-500">
                      {unit.is_new_unit ? "New unit" : "Existing"} · {unit.residence_type || "—"}
                    </span>
                  </div>
                  {unit.proofs.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {unit.proofs.map((proof) => (
                        <li key={proof.id} className="text-[12px] text-slate-600">
                          <span className="font-medium capitalize">{proof.kind.replaceAll("_", " ")}</span>
                          {": "}
                          <a href={proof.file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            View file
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[12px] text-slate-400">No proof files attached.</p>
                  )}
                </div>
              ))}
            </div>
            {viewing.status === "pending" ? (
              <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
                <button type="button" className="nl-btn-secondary" onClick={() => void reject(viewing)} disabled={busyId === viewing.id}>
                  Reject
                </button>
                <button type="button" className="nl-btn-primary" onClick={() => void approve(viewing)} disabled={busyId === viewing.id}>
                  Approve all
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
