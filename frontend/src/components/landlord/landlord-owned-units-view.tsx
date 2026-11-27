"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Building2, Home, KeyRound, UserRound, Users } from "lucide-react";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import {
  decideLandlordAdvisory,
  occupancyLabel,
  type LandlordDashboardStats,
  type LandlordOccupancy,
  type LandlordPortfolioPayload,
  type LandlordPortfolioUnit,
} from "@/lib/api/landlord";

const OCCUPANCY = {
  self_occupied: { label: "Self-occupied", className: "bg-emerald-50 text-emerald-800" },
  rented: { label: "Rented", className: "bg-amber-50 text-amber-800" },
  vacant: { label: "Vacant", className: "bg-slate-100 text-slate-600" },
} as const;

type OccupancyKey = keyof typeof OCCUPANCY;

type OwnedUnit = {
  unit_id: number;
  unit_number: string;
  occupancy_status: OccupancyKey;
  resident_count: number;
  residents: NonNullable<LandlordPortfolioUnit["residents"]>;
};

function occupancyKey(value: string): OccupancyKey {
  if (value === "self_occupied" || value === "live_here") return "self_occupied";
  if (value === "rented") return "rented";
  return "vacant";
}

function ownedUnits(payload: LandlordPortfolioPayload): OwnedUnit[] {
  const roster = new Map(payload.landlord_units.map((unit) => [unit.unit_id, unit]));
  const seen = new Set<number>();
  const rows: OwnedUnit[] = [];

  for (const point of payload.occupancy_graph ?? []) {
    if (point.relationship !== "owner") continue;
    seen.add(point.unit_id);
    const unit = roster.get(point.unit_id);
    rows.push({
      unit_id: point.unit_id,
      unit_number: point.unit_number,
      occupancy_status: occupancyKey(point.occupancy_status),
      resident_count: point.resident_count,
      residents: (unit?.residents ?? []).filter((resident) => resident.status !== "left"),
    });
  }

  for (const unit of payload.landlord_units) {
    if (seen.has(unit.unit_id)) continue;
    rows.push({
      unit_id: unit.unit_id,
      unit_number: unit.unit_number,
      occupancy_status: occupancyKey(unit.occupancy),
      resident_count: unit.resident_count ?? unit.residents?.filter((resident) => resident.status === "active").length ?? 0,
      residents: (unit.residents ?? []).filter((resident) => resident.status !== "left"),
    });
  }

  return rows.sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }));
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(status?: string | null) {
  if (!status) return "Pending review";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const EMPTY_STATS: LandlordDashboardStats = {
  total_owned_units: 0,
  rented_units: 0,
  vacant_units: 0,
  self_occupied_units: 0,
  tenant_status: {
    is_also_tenant: false,
    summary: "",
    resident_unit_numbers: [],
  },
};

function shareLabel(count: number, total: number) {
  if (total < 1) return "No owned units yet";
  const pct = Math.round((count / total) * 100);
  return `${pct}% of owned units`;
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-[1.7rem] font-bold leading-none tabular-nums tracking-tight text-slate-900">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F8F4] text-[#0F766E]">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-[12px] text-slate-400">{hint}</p>
    </article>
  );
}

function OccupancyPill({ status }: { status: OccupancyKey }) {
  const item = OCCUPANCY[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${item.className}`}>
      {item.label}
    </span>
  );
}

export function LandlordOwnedUnitsView({
  communityName,
  payload,
  onChanged,
}: {
  communityName?: string | null;
  payload: LandlordPortfolioPayload;
  onChanged: () => Promise<unknown>;
}) {
  const units = ownedUnits(payload);
  const claims = payload.pending_claims ?? [];
  const requests = payload.advisory_reviews ?? [];
  const stats = payload.dashboard_stats ?? EMPTY_STATS;
  const tenantYes = stats.tenant_status.is_also_tenant;
  const tenantUnits = stats.tenant_status.resident_unit_numbers;
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [reasonMissing, setReasonMissing] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function decide(id: number, status: "approved" | "rejected") {
    const reason = reasons[id]?.trim() ?? "";
    if (status === "rejected" && reason.length === 0) {
      setReasonMissing(id);
      return;
    }
    setReasonMissing(null);
    setBusyId(id);
    try {
      await decideLandlordAdvisory(id, status, status === "rejected" ? reason : undefined);
      toastSuccess(status === "approved" ? "Resident request approved." : "Resident request rejected.");
      setReasons((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      await onChanged();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  }

  const title = communityName?.trim()
    ? communityName.trim().replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    : "Owned units";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E7F8F4] text-[#0F766E]">
              <Home className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Owned units</p>
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-[1.35rem]">{title}</h1>
              <p className="mt-0.5 text-[13px] text-slate-500">
                Claimed units you own, and new resident requests you can approve or reject.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-medium text-slate-600">
              <Home className="h-3.5 w-3.5" />
              {units.length} claimed {units.length === 1 ? "unit" : "units"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CFF3EA] bg-[#E7F8F4] px-3 py-1.5 text-[12px] font-medium text-[#0F766E]">
              <UserRound className="h-3.5 w-3.5" />
              {requests.length} {requests.length === 1 ? "request" : "requests"}
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard label="Total owned units" value={String(stats.total_owned_units)} hint="Approved ownership" icon={<Building2 className="h-[18px] w-[18px]" />} />
        <MetricCard label="Rented units" value={String(stats.rented_units)} hint={shareLabel(stats.rented_units, stats.total_owned_units)} icon={<KeyRound className="h-[18px] w-[18px]" />} />
        <MetricCard label="Vacant units" value={String(stats.vacant_units)} hint={stats.vacant_units === 0 ? "None sitting empty" : shareLabel(stats.vacant_units, stats.total_owned_units)} icon={<Home className="h-[18px] w-[18px]" />} />
        <MetricCard label="Self-occupied units" value={String(stats.self_occupied_units)} hint={stats.self_occupied_units === 0 ? "None marked as your home" : shareLabel(stats.self_occupied_units, stats.total_owned_units)} icon={<UserRound className="h-[18px] w-[18px]" />} />
        <MetricCard
          label="Tenant status"
          value={tenantYes ? "Yes" : "No"}
          hint={tenantYes ? (tenantUnits.length ? `Unit ${tenantUnits.join(", ")}` : "Renting a unit you do not own") : "Owner only in this community"}
          icon={<Users className="h-[18px] w-[18px]" />}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Claimed units</h2>
          <p className="text-[12px] text-slate-400">Units approved as yours, with who lives there</p>
        </div>
        {units.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[13px] text-slate-400">No approved units yet.</p>
            <Link href="/landlord" className="mt-2 inline-block text-[13px] font-semibold text-[#0F766E]">
              Claim a unit from My Properties
            </Link>
          </div>
        ) : (
          <ul>
            {units.map((unit) => (
              <li key={unit.unit_id} className="border-t border-slate-100 px-5 py-4 first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E7F8F4] text-[#0F766E]">
                      <Home className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-slate-900">Unit {unit.unit_number}</span>
                      <span className="text-[12px] text-slate-400">Owner</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <OccupancyPill status={unit.occupancy_status} />
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                        unit.resident_count === 0 ? "bg-slate-50 text-slate-500" : "bg-[#E7F8F4] text-[#0F766E]"
                      }`}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {unit.resident_count} {unit.resident_count === 1 ? "resident" : "residents"}
                    </span>
                  </span>
                </div>
                {unit.residents.length > 0 ? (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {unit.residents.map((resident) => (
                      <li key={resident.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <p className="truncate text-[13px] font-semibold text-slate-800">
                          {resident.name?.trim() || resident.email || "Resident"}
                        </p>
                        <p className="truncate text-[12px] text-slate-500">{resident.email || "No email"}</p>
                        <p className="mt-1 text-[11px] font-medium text-slate-400">
                          {statusLabel(resident.status)}
                          {resident.is_billing_contact ? " · Billing contact" : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-[12px] text-slate-400">No residents listed on this unit.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {claims.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-slate-900">Claims waiting for admin</h2>
            <p className="text-[12px] text-slate-400">Ownership claims the community has not approved yet</p>
          </div>
          <ul>
            {claims.map((claim) => (
              <li key={claim.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 first:border-t-0">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-slate-900">Unit {claim.unit_number}</span>
                  <span className="text-[12px] text-slate-400">
                    Claimed as {occupancyLabel(claim.occupancy as LandlordOccupancy)}
                    {claim.created_at ? ` · ${formatWhen(claim.created_at)}` : ""}
                  </span>
                </span>
                <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  Pending admin
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Resident requests</h2>
          <p className="text-[12px] text-slate-400">Approve a new resident, or reject them with a reason</p>
        </div>
        {requests.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-slate-400">No resident requests right now.</p>
        ) : (
          <ul>
            {requests.map((review) => {
              const busy = busyId === review.id;
              const reason = reasons[review.id] ?? "";
              const missing = reasonMissing === review.id && reason.trim().length === 0;
              return (
                <li key={review.id} className="border-t border-slate-100 px-5 py-4 first:border-t-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-slate-900">
                        {review.display_name?.trim() || review.email}
                      </p>
                      <p className="truncate text-[12px] text-slate-500">{review.email}</p>
                      <p className="mt-1 text-[12px] text-slate-400">
                        Unit {review.unit_number}
                        {review.resident_status ? ` · ${statusLabel(review.resident_status)}` : ""}
                        {review.created_at ? ` · ${formatWhen(review.created_at)}` : ""}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">
                      New resident
                    </span>
                  </div>
                  <label className="mt-3 block text-[12px] font-medium text-slate-600" htmlFor={`reason-${review.id}`}>
                    Reason for rejection
                  </label>
                  <textarea
                    id={`reason-${review.id}`}
                    value={reason}
                    rows={2}
                    maxLength={2000}
                    placeholder="Required if you reject this request"
                    onChange={(event) => {
                      const value = event.target.value;
                      setReasons((current) => ({ ...current, [review.id]: value }));
                      if (value.trim()) setReasonMissing((current) => (current === review.id ? null : current));
                    }}
                    className={`mt-1.5 w-full resize-y rounded-xl border bg-white px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-[#0F766E] ${
                      missing ? "border-rose-300" : "border-slate-200"
                    }`}
                  />
                  {missing ? <p className="mt-1 text-[12px] text-rose-600">Add a reason before rejecting.</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(review.id, "approved")}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? "Saving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(review.id, "rejected")}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
