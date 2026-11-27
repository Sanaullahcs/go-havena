"use client";

import type { ReactNode } from "react";
import { Building2, Home, KeyRound, UserRound, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LandlordDashboardStats, LandlordOccupancyGraphPoint } from "@/lib/api/landlord";

const KIND = {
  self_occupied: { label: "Self-occupied", color: "#14B8A6" },
  rented: { label: "Rented out", color: "#F59E0B" },
  vacant: { label: "Vacant", color: "#94A3B8" },
  tenant: { label: "Living as tenant", color: "#1B4F8A" },
} as const;

const OCCUPANCY_LABEL = {
  self_occupied: "Self-occupied",
  rented: "Rented",
  vacant: "Vacant",
} as const;

function displayCommunityName(name?: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) return "Dashboard";
  return trimmed.replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

function HeroStat({
  icon,
  label,
  tone = "slate",
}: {
  icon: ReactNode;
  label: string;
  tone?: "slate" | "mint" | "amber";
}) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    mint: "border-[#CFF3EA] bg-[#E7F8F4] text-[#0F766E]",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
  } as const;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium ${tones[tone]}`}>
      {icon}
      {label}
    </span>
  );
}

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

function OccupancyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: LandlordOccupancyGraphPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const color = KIND[point.kind].color;

  return (
    <div className="min-w-[200px] rounded-xl border border-slate-100 bg-white px-3.5 py-3 shadow-xl">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        Unit {point.unit_number}
      </p>
      <dl className="mt-2 space-y-1 text-[12px]">
        <Tip label="Relationship" value={point.relationship === "owner" ? "Owner" : "Tenant"} />
        <Tip label="Occupancy" value={OCCUPANCY_LABEL[point.occupancy_status]} />
        <Tip label="Residents" value={String(point.resident_count)} />
      </dl>
    </div>
  );
}

function Tip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: LandlordOccupancyGraphPoint["occupancy_status"] }) {
  const styles = {
    self_occupied: "bg-emerald-50 text-emerald-700",
    rented: "bg-amber-50 text-amber-700",
    vacant: "bg-slate-100 text-slate-600",
  } as const;

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles[status]}`}>
      {OCCUPANCY_LABEL[status]}
    </span>
  );
}

export function LandlordDashboardView({
  communityName,
  stats,
  points,
}: {
  communityName?: string | null;
  stats: LandlordDashboardStats;
  points: LandlordOccupancyGraphPoint[];
}) {
  const residents = points.reduce((sum, point) => sum + point.resident_count, 0);
  const occupiedUnits = points.filter((point) => point.kind !== "vacant").length;
  const occupiedRate = points.length > 0 ? Math.round((occupiedUnits / points.length) * 100) : 0;
  const tenantYes = stats.tenant_status.is_also_tenant;
  const tenantUnits = stats.tenant_status.resident_unit_numbers;

  const mix = (Object.keys(KIND) as Array<keyof typeof KIND>).map((key) => ({
    key,
    name: KIND[key].label,
    value: points.filter((point) => point.kind === key).length,
    color: KIND[key].color,
  }));
  const pie = mix.filter((slice) => slice.value > 0);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E7F8F4] text-[#0F766E]">
              <Building2 className="h-5 w-5" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Landlord</p>
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-[1.35rem]">
                {displayCommunityName(communityName)}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeroStat
              icon={<Building2 className="h-3.5 w-3.5" />}
              label={`${stats.total_owned_units} owned ${stats.total_owned_units === 1 ? "unit" : "units"}`}
            />
            <HeroStat
              icon={<Users className="h-3.5 w-3.5" />}
              label={`${residents} ${residents === 1 ? "resident" : "residents"}`}
            />
            <HeroStat
              icon={<span className={`h-1.5 w-1.5 rounded-full ${tenantYes ? "bg-amber-500" : "bg-emerald-500"}`} />}
              label={tenantYes ? `Tenant in unit ${tenantUnits.join(", ") || "another unit"}` : "Not renting elsewhere"}
              tone={tenantYes ? "amber" : "mint"}
            />
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

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:col-span-2 sm:p-5">
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold text-slate-900">Unit occupancy</h2>
            <p className="text-[12px] text-slate-400">Residents in each unit you own or rent</p>
          </div>
          {points.length === 0 ? (
            <p className="flex h-[240px] items-center justify-center text-[13px] text-slate-400">Approved units will appear here.</p>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={points} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="landlordOccFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14B8A6" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#14B8A6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 6" />
                  <XAxis dataKey="unit_number" tick={{ fontSize: 12, fill: "#64748B", fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={28} domain={[0, "dataMax + 1"]} />
                  <Tooltip content={<OccupancyTooltip />} cursor={{ stroke: "#99F6E4", strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="resident_count"
                    name="Residents"
                    stroke="#0D9488"
                    strokeWidth={2.5}
                    fill="url(#landlordOccFill)"
                    dot={{ r: 4, fill: "#0D9488", stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: "#0F766E", stroke: "#fff", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="mb-2">
            <h2 className="text-[15px] font-semibold text-slate-900">Occupancy mix</h2>
            <p className="text-[12px] text-slate-400">How your units are used</p>
          </div>
          {points.length === 0 ? (
            <p className="flex h-[220px] items-center justify-center text-[13px] text-slate-400">No units yet.</p>
          ) : (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
              <div className="relative h-[168px] w-[168px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={72} paddingAngle={3} stroke="none" isAnimationActive={false}>
                      {pie.map((slice) => (
                        <Cell key={slice.key} fill={slice.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[1.45rem] font-bold leading-none text-slate-900">{occupiedRate}%</span>
                  <span className="mt-0.5 text-[11px] text-slate-400">In use</span>
                </div>
              </div>
              <ul className="w-full space-y-2">
                {mix.map((slice) => {
                  const pct = points.length > 0 ? Math.round((slice.value / points.length) * 100) : 0;
                  return (
                    <li key={slice.key} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="flex min-w-0 items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
                        <span className="truncate">{slice.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">
                        <span className="font-semibold text-slate-800">{slice.value}</span>
                        <span className="ml-1.5">{pct}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Your units</h2>
          <p className="text-[12px] text-slate-400">Relationship, occupancy, and residents</p>
        </div>
        {points.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-slate-400">No units to show yet.</p>
        ) : (
          <div>
            <div className="hidden grid-cols-[1.4fr_1fr_1fr_auto] gap-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 sm:grid">
              <span>Unit</span>
              <span>Relationship</span>
              <span>Occupancy</span>
              <span className="w-[7.5rem] text-left">Residents</span>
            </div>
            <ul>
              {points.map((point) => (
                <li
                  key={point.unit_id}
                  className="grid grid-cols-2 items-center gap-x-3 gap-y-2 border-t border-slate-100 px-5 py-3.5 sm:grid-cols-[1.4fr_1fr_1fr_auto]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E7F8F4] text-[#0F766E]"
                      aria-hidden
                    >
                      <Home className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="truncate text-[14px] font-semibold text-slate-900">{point.unit_number}</span>
                  </span>
                  <span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        point.relationship === "owner" ? "bg-[#E7F8F4] text-[#0F766E]" : "bg-sky-50 text-sky-800"
                      }`}
                    >
                      {point.relationship === "owner" ? "Owner" : "Tenant"}
                    </span>
                  </span>
                  <span>
                    <StatusPill status={point.occupancy_status} />
                  </span>
                  <span className="col-span-2 flex justify-end sm:col-span-1">
                    <span
                      className={`inline-flex w-[7.5rem] items-center justify-start gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums ${
                        point.resident_count === 0 ? "bg-slate-50 text-slate-500" : "bg-[#E7F8F4] text-[#0F766E]"
                      }`}
                    >
                      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {point.resident_count}
                      <span className="font-medium">
                        {point.resident_count === 1 ? "resident" : "residents"}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
