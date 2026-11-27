"use client";

import { useCallback, useEffect, useState } from "react";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { apiError } from "@/lib/api/client";
import { fetchMyUnits, type MyUnitRecord } from "@/lib/api/property-services";
import { acceptBillingContactTransfer, rejectBillingContactTransfer } from "@/lib/api/landlord";
import { toastError, toastSuccess } from "@/lib/alert";

function occupancyLabel(value?: string | null) {
  if (value === "live_here") return "Live here";
  if (value === "rented") return "Rented";
  if (value === "vacant") return "Vacant";
  return "—";
}

function resolveApprovalStatus(unit: MyUnitRecord): string | null {
  const raw = String(unit.approval_status ?? "").trim().toLowerCase();
  if (raw === "approved" || raw === "pending" || raw === "rejected") return raw;
  const ownership = String(unit.ownership_status ?? "").trim().toLowerCase();
  if (ownership === "approved" || ownership === "pending" || ownership === "rejected") return ownership;
  const assoc = String(unit.association_status ?? "").trim().toLowerCase();
  if (assoc === "active") return "approved";
  if (assoc === "pending" || assoc === "rejected") return assoc;
  return null;
}

function approvalLabel(value?: string | null) {
  if (value === "approved") return "Approved";
  if (value === "pending") return "Pending";
  if (value === "rejected") return "Rejected";
  return "—";
}

function approvalClass(value?: string | null) {
  if (value === "approved") return "bg-emerald-50 text-emerald-700";
  if (value === "pending") return "bg-amber-50 text-amber-700";
  if (value === "rejected") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-500";
}

function occupancyClass(value?: string | null) {
  if (value === "live_here") return "bg-sky-50 text-sky-800";
  if (value === "rented") return "bg-violet-50 text-violet-700";
  if (value === "vacant") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-500";
}

function viewerLivesInUnit(unit: MyUnitRecord) {
  const assoc = String(unit.association_status ?? "").toLowerCase();
  if (assoc !== "active") return false;
  const occupancy = String(unit.occupancy ?? "").toLowerCase();
  if (occupancy === "rented" || occupancy === "vacant") return false;
  return true;
}

function billingSummary(unit: MyUnitRecord): string {
  if (unit.is_billing_contact) return "You are the billing contact for this unit.";
  const name = String(unit.billing_contact?.name ?? "").trim();
  if (name) return name;
  return "No billing contact assigned yet.";
}

function residentsSummary(unit: MyUnitRecord): string {
  const count = Math.max(0, Number(unit.resident_count ?? 0));
  const occupancy = String(unit.occupancy ?? "").toLowerCase();
  const livesHere = viewerLivesInUnit(unit);

  if (livesHere) {
    if (occupancy === "live_here" && count <= 1) return "You live in this unit.";
    if (count === 0) return "You live in this unit.";
    return `${count} residents currently living in this unit.`;
  }

  if (occupancy === "rented" || occupancy === "vacant" || unit.association_status === "ownership") {
    if (count === 0) return "No residents currently living in this unit.";
    return `${count} residents currently living in this unit.`;
  }

  if (count === 0) return "No residents currently living in this unit.";
  return `${count} residents currently living in this unit.`;
}

export default function MyUnitsPage() {
  const [units, setUnits] = useState<MyUnitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTransferId, setBusyTransferId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchMyUnits();
      setUnits(payload.units);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PageLoader label="Loading your units…" />;
  if (error) return <PageError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Your homes</p>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">My Units</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          {units.length} registered {units.length === 1 ? "unit" : "units"}. Occupancy, residents, and admin approval
          are shown separately.
        </p>
      </div>

      {units.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          No units yet. When you register or are approved for a unit, it will show up here.
        </section>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {units.map((unit) => {
            const approval = resolveApprovalStatus(unit);
            const billing = billingSummary(unit);
            return (
              <article
                key={`${unit.id}-${unit.unit_number}`}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-slate-900">Unit {unit.unit_number}</h2>
                <dl className="mt-3 space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="font-semibold text-slate-600">Occupancy</dt>
                    <dd>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${occupancyClass(unit.occupancy)}`}>
                        {occupancyLabel(unit.occupancy)}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="font-semibold text-slate-600">Admin approval</dt>
                    <dd>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${approvalClass(approval)}`}>
                        {approvalLabel(approval)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Residents</dt>
                    <dd className="mt-1 text-slate-700">{residentsSummary(unit)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Billing contact</dt>
                    <dd
                      className={`mt-1 ${
                        unit.is_billing_contact
                          ? "font-semibold text-emerald-700"
                          : billing.includes("No billing")
                            ? "italic text-slate-400"
                            : "text-slate-700"
                      }`}
                    >
                      {billing}
                    </dd>
                  </div>
                </dl>
                {unit.incoming_transfer ? (
                  <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                    <p>
                      {unit.incoming_transfer.requested_by?.name || "A resident"} asked you to become the billing contact for this unit.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={busyTransferId === unit.incoming_transfer.id}
                        onClick={() => {
                          const requestId = unit.incoming_transfer?.id;
                          if (!requestId) return;
                          setBusyTransferId(requestId);
                          void acceptBillingContactTransfer(requestId)
                            .then(() => {
                              toastSuccess("You are now the billing contact.");
                              return load();
                            })
                            .catch((err) => toastError(apiError(err)))
                            .finally(() => setBusyTransferId(null));
                        }}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busyTransferId === unit.incoming_transfer.id}
                        onClick={() => {
                          const requestId = unit.incoming_transfer?.id;
                          if (!requestId) return;
                          setBusyTransferId(requestId);
                          void rejectBillingContactTransfer(requestId)
                            .then(() => {
                              toastSuccess("Request declined. The current billing contact is unchanged.");
                              return load();
                            })
                            .catch((err) => toastError(apiError(err)))
                            .finally(() => setBusyTransferId(null));
                        }}
                        className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ) : null}
                {approval === "rejected" && unit.association_rejection_reason ? (
                  <p className="mt-2 text-xs text-rose-700">{unit.association_rejection_reason}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}