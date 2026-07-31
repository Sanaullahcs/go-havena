"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_PRIMARY, CHART_PRIMARY_DEEP, NL } from "@/lib/design-tokens";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-2xl border px-4 py-3 shadow-2xl"
      style={{ borderColor: NL.borderCard, background: "#fff", boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)" }}
    >
      {label ? (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: NL.textMuted }}>
          {label}
        </p>
      ) : null}
      <div className="space-y-1.5">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-6 text-[13px]">
            <span className="flex items-center gap-2 font-medium" style={{ color: NL.textSecondary }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-bold tabular-nums" style={{ color: NL.textPrimary }}>
              {p.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartEmpty({ message, fill = false }: { message: string; fill?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center ${
        fill ? "min-h-[280px] flex-1" : "h-[280px]"
      }`}
      style={{ borderColor: NL.borderCard, background: NL.surfaceMuted }}
    >
      <p className="text-[13px] font-medium" style={{ color: NL.textMuted }}>
        {message}
      </p>
    </div>
  );
}

function ChartPlot({ children }: { children: ReactNode }) {
  return <div className="min-h-[220px] w-full flex-1">{children}</div>;
}

export function DashboardActivityChart({ data }: { data?: { date: string; count: number }[] }) {
  const chartData = (data ?? []).map((point) => ({ day: point.date, Activity: point.count }));
  const total = chartData.reduce((sum, row) => sum + row.Activity, 0);
  const peak = chartData.reduce((max, row) => Math.max(max, row.Activity), 0);

  if (chartData.length === 0) return <ChartEmpty message="No activity recorded in the last 7 days" fill />;

  return (
    <div className="flex h-full min-h-[280px] flex-col">
      <div className="mb-4 flex flex-wrap gap-3">
        <MetricPill label="7-day total" value={total.toLocaleString()} />
        <MetricPill label="Peak day" value={peak.toLocaleString()} accent />
      </div>
      <ChartPlot>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="dashActivityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="dashActivityStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={CHART_PRIMARY_DEEP} />
                <stop offset="100%" stopColor="#0179FF" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 6" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: NL.textMuted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: NL.textMuted }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART_PRIMARY, strokeWidth: 1, strokeDasharray: "4 4" }} />
            <Area
              type="monotone"
              dataKey="Activity"
              name="Actions"
              stroke="url(#dashActivityStroke)"
              strokeWidth={2.5}
              fill="url(#dashActivityFill)"
              dot={false}
              activeDot={{ r: 5, fill: CHART_PRIMARY, stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPlot>
    </div>
  );
}

export function DashboardMembersBarChart({
  data,
  variant = "default",
}: {
  data?: { month: string; count: number }[];
  variant?: "default" | "minimal";
}) {
  const chartData = (data ?? []).map((point) => ({ month: point.month, new: point.count }));
  if (chartData.length === 0) return <ChartEmpty message="No member growth data yet" fill />;

  const total = chartData.reduce((sum, row) => sum + row.new, 0);
  const latest = chartData[chartData.length - 1];
  const peak = chartData.reduce((best, row) => (row.new > best.new ? row : best), chartData[0]);
  const activeMonths = chartData.filter((row) => row.new > 0).length;
  const insight =
    latest.new > 0
      ? `${latest.month} added ${latest.new} new member${latest.new === 1 ? "" : "s"}.`
      : activeMonths === 0
        ? "No new memberships recorded in this period yet."
        : `${activeMonths} month${activeMonths === 1 ? "" : "s"} with new sign-ups so far.`;

  if (variant === "minimal") {
    return (
      <div className="nl-chart-minimal flex h-full min-h-[240px] flex-col">
        <div className="nl-chart-minimal-stats">
          <div className="nl-chart-hero-stat">
            <span className="nl-chart-hero-value">{latest.new}</span>
            <span className="nl-chart-hero-label">this month</span>
          </div>
          <div className="nl-chart-meta-line">
            <span>
              <strong>{total}</strong> total new
            </span>
            <span aria-hidden>·</span>
            <span>
              peak <strong>{peak.new}</strong> in {peak.month.split(" ")[0]}
            </span>
          </div>
        </div>
        <ChartPlot>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barSize={22} barCategoryGap="32%">
              <defs>
                {chartData.map((_, i) => (
                  <linearGradient key={i} id={`dashBarMin${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={i === chartData.length - 1 ? "#8B5CF6" : "#DDD6FE"} />
                    <stop offset="100%" stopColor={i === chartData.length - 1 ? "#6D28D9" : "#EDE9FE"} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => String(v).split(" ")[0]} />
              <YAxis hide allowDecimals={false} domain={[0, "dataMax"]} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(245, 243, 255, 0.45)" }} />
              <Bar dataKey="new" name="New Members" radius={[8, 8, 2, 2]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={`url(#dashBarMin${i})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPlot>
        <p className="nl-chart-footnote">{insight}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <MetricPill label="Total new" value={total.toLocaleString()} accent={total > 0} compact />
        <MetricPill label="Latest month" value={latest.new.toLocaleString()} compact />
        <MetricPill label="Peak month" value={`${peak.new} · ${peak.month}`} compact />
      </div>
      <ChartPlot>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barSize={28} barCategoryGap="28%">
            <defs>
              {chartData.map((_, i) => (
                <linearGradient key={i} id={`dashBar${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={i === chartData.length - 1 ? CHART_PRIMARY : "#93C5FD"} />
                  <stop offset="100%" stopColor={i === chartData.length - 1 ? CHART_PRIMARY_DEEP : "#BFDBFE"} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 6" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: NL.textMuted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: NL.textMuted }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, "dataMax"]} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(241, 245, 249, 0.6)" }} />
            <Bar dataKey="new" name="New Members" radius={[10, 10, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={`url(#dashBar${i})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartPlot>
      <p className="mt-auto rounded-lg border px-3 py-2 text-[12px] leading-snug" style={{ borderColor: NL.borderCard, background: NL.surfaceMuted, color: NL.textSecondary }}>
        {insight}
      </p>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  approved: NL.success,
  pending: NL.warning,
  banned: NL.danger,
  rejected: "#94A3B8",
  onboarding: CHART_PRIMARY,
};

const STATUS_ORDER = ["approved", "pending", "onboarding", "banned", "rejected"] as const;

const STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  pending: "Pending",
  onboarding: "Onboarding",
  banned: "Suspended",
  rejected: "Rejected",
};

function normalizeStatusData(data?: { status: string; count: number }[]) {
  const map = new Map((data ?? []).map((item) => [item.status, item.count]));
  return STATUS_ORDER.map((status) => ({
    status,
    name: STATUS_LABELS[status] ?? status,
    value: map.get(status) ?? 0,
    color: STATUS_COLORS[status] ?? "#64748B",
  }));
}

export function DashboardMembersPieChart({
  data,
  variant = "default",
}: {
  data?: { status: string; count: number }[];
  variant?: "default" | "minimal";
}) {
  const statusData = normalizeStatusData(data);
  const total = statusData.reduce((sum, item) => sum + item.value, 0);
  const active = statusData.find((item) => item.status === "approved")?.value ?? 0;
  const pending = statusData.find((item) => item.status === "pending")?.value ?? 0;
  const onboarding = statusData.find((item) => item.status === "onboarding")?.value ?? 0;
  const needsAttention = pending + onboarding + (statusData.find((item) => item.status === "banned")?.value ?? 0);
  const activeRate = total > 0 ? Math.round((active / total) * 100) : 0;
  const chartSlices = statusData.filter((item) => item.value > 0);

  if (total === 0) return <ChartEmpty message="No membership records yet" fill />;

  const insight =
    pending > 0
      ? `${pending} membership${pending === 1 ? "" : "s"} waiting for your review.`
      : onboarding > 0
        ? `${onboarding} resident${onboarding === 1 ? "" : "s"} still completing onboarding.`
        : activeRate === 100
          ? "All members are approved and active in your community."
          : `${activeRate}% of members are fully approved.`;

  if (variant === "minimal") {
    const visibleStatuses = statusData.filter((item) => item.value > 0 || item.status === "approved" || item.status === "pending");

    return (
      <div className="nl-chart-minimal flex h-full min-h-[240px] flex-col">
        <div className="nl-chart-minimal-stats">
          <div className="nl-chart-hero-stat">
            <span className="nl-chart-hero-value">{activeRate}%</span>
            <span className="nl-chart-hero-label">active rate</span>
          </div>
          <div className="nl-chart-meta-line">
            <span>
              <strong>{total}</strong> members
            </span>
            <span aria-hidden>·</span>
            <span>
              <strong>{pending}</strong> pending
            </span>
          </div>
        </div>

        <div className="nl-donut-wrap">
          <div className="relative mx-auto h-[132px] w-[132px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartSlices.length > 0 ? chartSlices : [{ name: "Empty", value: 1, color: "#E2E8F0" }]}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={58}
                  paddingAngle={chartSlices.length > 1 ? 3 : 0}
                  strokeWidth={0}
                >
                  {(chartSlices.length > 0 ? chartSlices : [{ name: "Empty", value: 1, color: "#E2E8F0" }]).map((item, i) => (
                    <Cell key={i} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold tabular-nums leading-none text-slate-900">{total}</p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">total</p>
            </div>
          </div>

          <div className="nl-status-chips">
            {visibleStatuses.map((item) => (
              <span key={item.status} className="nl-status-chip">
                <span className="nl-status-chip-dot" style={{ background: item.color }} aria-hidden />
                <span className="nl-status-chip-label">{item.name}</span>
                <span className="nl-status-chip-value">{item.value}</span>
              </span>
            ))}
          </div>
        </div>

        <div className={`nl-health-strip ${needsAttention > 0 ? "nl-health-strip--warn" : "nl-health-strip--ok"}`}>
          <span className="nl-health-strip-dot" aria-hidden />
          <span className="nl-health-strip-text">{insight}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <MetricPill label="Active rate" value={`${activeRate}%`} accent={activeRate >= 80} compact />
        <MetricPill label="Pending" value={pending.toLocaleString()} accent={pending > 0} compact />
        <MetricPill label="Onboarding" value={onboarding.toLocaleString()} compact />
      </div>

      <div className="grid flex-1 gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-center">
        <div className="relative mx-auto h-[120px] w-[120px] shrink-0 sm:mx-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartSlices.length > 0 ? chartSlices : [{ name: "Empty", value: 1, color: "#E2E8F0" }]}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={34}
                outerRadius={48}
                paddingAngle={chartSlices.length > 1 ? 4 : 0}
                strokeWidth={0}
              >
                {(chartSlices.length > 0 ? chartSlices : [{ name: "Empty", value: 1, color: "#E2E8F0" }]).map((item, i) => (
                  <Cell key={i} fill={item.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xl font-bold tabular-nums leading-none" style={{ color: NL.textPrimary }}>
              {total}
            </p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: NL.textMuted }}>
              Members
            </p>
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          {statusData.map((item) => (
            <div
              key={item.status}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 rounded-md border px-2 py-1.5"
              style={{
                borderColor: item.value > 0 ? NL.borderCard : "rgba(226, 232, 240, 0.7)",
                background: item.value > 0 ? NL.surfaceMuted : "rgba(248, 250, 252, 0.6)",
                opacity: item.value > 0 ? 1 : 0.72,
              }}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="min-w-0 truncate text-[11px] font-semibold" style={{ color: NL.textBody }}>
                {item.name}
              </span>
              <span className="text-[12px] font-bold tabular-nums" style={{ color: NL.textPrimary }}>
                {item.value}
              </span>
              <span className="min-w-[2rem] text-right text-[10px] tabular-nums" style={{ color: NL.textMuted }}>
                {total > 0 ? Math.round((item.value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-auto rounded-lg border px-3 py-2.5"
        style={{
          borderColor: needsAttention > 0 ? "rgba(251, 191, 36, 0.35)" : "rgba(16, 185, 129, 0.25)",
          background: needsAttention > 0 ? "linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 100%)" : "linear-gradient(135deg, #ECFDF5 0%, #FFFFFF 100%)",
        }}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: NL.textMuted }}>
            Community health
          </p>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{
              background: needsAttention > 0 ? "#FEF3C7" : "#D1FAE5",
              color: needsAttention > 0 ? "#B45309" : "#047857",
            }}
          >
            {needsAttention > 0 ? "Needs attention" : "Healthy"}
          </span>
        </div>
        <div className="mb-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "#E5E7EB" }}>
          <div className="flex h-full overflow-hidden rounded-full">
            <div className="h-full transition-all duration-700" style={{ width: `${activeRate}%`, background: NL.success }} />
            <div
              className="h-full transition-all duration-700"
              style={{ width: `${100 - activeRate}%`, background: pending > 0 ? NL.warning : "#CBD5E1" }}
            />
          </div>
        </div>
        <p className="text-[11px] leading-snug" style={{ color: NL.textSecondary }}>
          {insight}
        </p>
      </div>
    </div>
  );
}

export function DashboardModerationChart({
  data,
  reportsByType,
}: {
  data?: { date: string; filed: number; resolved: number }[];
  reportsByType?: { type: string; count: number }[];
}) {
  const trendData = (data ?? []).map((point) => ({
    day: point.date,
    Filed: point.filed,
    Resolved: point.resolved,
  }));

  if (trendData.some((point) => point.Filed > 0 || point.Resolved > 0)) {
    return (
      <div className="flex h-full min-h-[280px] flex-col">
        <ChartPlot>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }} barSize={12} barGap={4}>
              <CartesianGrid vertical={false} stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 6" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: NL.textMuted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: NL.textMuted }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(239, 246, 255, 0.45)" }} />
              <Bar dataKey="Filed" name="Filed" fill="#FCA5A5" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Resolved" name="Resolved" fill={NL.success} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPlot>
      </div>
    );
  }

  const typeData = (reportsByType ?? []).map((item) => ({
    type: item.type.charAt(0).toUpperCase() + item.type.slice(1),
    count: item.count,
  }));
  if (typeData.length === 0) return <ChartEmpty message="No moderation data yet" fill />;

  return (
    <div className="flex h-full min-h-[280px] flex-col">
      <ChartPlot>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={typeData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }} barSize={14}>
            <CartesianGrid horizontal={false} stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 6" />
            <XAxis type="number" tick={{ fontSize: 11, fill: NL.textMuted }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: NL.textBody }} axisLine={false} tickLine={false} width={84} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(254, 242, 242, 0.4)" }} />
            <Bar dataKey="count" name="Reports" fill="#F87171" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPlot>
    </div>
  );
}

const COMMUNITY_BAR_COLORS = [CHART_PRIMARY_DEEP, CHART_PRIMARY, "#0179FF", "#0891B2", NL.success, NL.warning];

export function DashboardTopCommunitiesChart({
  data,
}: {
  data?: { id: number; name: string; region: string; members_count: number }[];
}) {
  const rows = (data ?? [])
    .filter((item) => item.name)
    .sort((a, b) => b.members_count - a.members_count)
    .slice(0, 4);

  if (rows.length === 0) {
    return <ChartEmpty message="No communities yet" />;
  }

  const max = Math.max(...rows.map((item) => item.members_count), 1);
  const totalResidents = rows.reduce((sum, item) => sum + item.members_count, 0);
  const leader = rows[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {leader ? (
        <div
          className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2.5"
          style={{ background: "linear-gradient(135deg, #ECFEFF 0%, #F0F9FF 100%)" }}
        >
          <p className="text-[12px] text-slate-600">
            Leading{" "}
            <strong className="font-bold text-slate-900">{leader.name}</strong>
          </p>
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500">
            Top {rows.length} · {totalResidents.toLocaleString()} residents
          </span>
        </div>
      ) : (
        <p className="mb-3 shrink-0 text-[12px] leading-relaxed text-slate-500">
          Communities are live — rankings appear once residents join.
        </p>
      )}

      <div className="nl-dashboard-panel-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-1 pr-2">
        <div className="flex flex-col gap-2">
        {rows.map((item, i) => {
          const width = max > 0 ? Math.max(item.members_count > 0 ? 8 : 0, (item.members_count / max) * 100) : 0;
          const color = COMMUNITY_BAR_COLORS[i % COMMUNITY_BAR_COLORS.length];
          const initial = item.name.trim().charAt(0).toUpperCase() || "?";
          const isLeader = i === 0;

          return (
            <div
              key={item.id}
              className={[
                "rounded-xl border px-2.5 py-2 transition hover:shadow-sm",
                isLeader ? "border-cyan-100 bg-cyan-50/30" : "border-slate-100 bg-slate-50/40 hover:bg-white",
              ].join(" ")}
            >
              <div className="grid grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto] items-center gap-2">
                <span
                  className={`text-center text-[10px] font-bold tabular-nums ${isLeader ? "text-cyan-600" : "text-slate-400"}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold"
                  style={{
                    background: `${color}18`,
                    color,
                  }}
                >
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-slate-900" title={item.name}>
                    {item.name}
                  </p>
                  {item.region ? (
                    <p className="mt-0.5 truncate text-[10px] text-slate-400" title={item.region}>
                      {item.region}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end justify-center text-right leading-none">
                  <strong className="text-[13px] font-bold tabular-nums text-slate-900">
                    {item.members_count.toLocaleString()}
                  </strong>
                  <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-slate-400">
                    residents
                  </span>
                </div>
              </div>
              {item.members_count > 0 ? (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200/70">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${width}%`, background: color, opacity: 0.85 }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use DashboardTopCommunitiesChart */
export function DashboardRegionsChart({ data }: { data?: { region: string; count: number }[] }) {
  const rows = (data ?? []).filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  if (rows.length === 0) return <ChartEmpty message="No communities mapped to regions yet" />;

  const total = rows.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(...rows.map((item) => item.count));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: NL.borderCard, background: NL.surfaceMuted }}>
        <div>
          <p className="text-4xl font-bold tabular-nums leading-none" style={{ color: NL.textPrimary }}>
            {total}
          </p>
          <p className="mt-1 text-[13px]" style={{ color: NL.textSecondary }}>
            communities across {rows.length} regions
          </p>
        </div>
        <span className="rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: NL.chipBg, color: CHART_PRIMARY_DEEP }}>
          Top: {rows[0].region}
        </span>
      </div>
      <div className="space-y-3">
        {rows.map((item, i) => {
          const width = max > 0 ? Math.max(8, (item.count / max) * 100) : 0;
          const color = COMMUNITY_BAR_COLORS[i % COMMUNITY_BAR_COLORS.length];
          return (
            <div key={item.region} className="group rounded-xl border p-3 transition hover:shadow-md" style={{ borderColor: NL.borderCard }}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: color }}>
                    {i + 1}
                  </span>
                  <span className="truncate text-[13px] font-semibold" style={{ color: NL.textBody }}>
                    {item.region}
                  </span>
                </div>
                <span className="text-[14px] font-bold tabular-nums" style={{ color: NL.textPrimary }}>
                  {item.count}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "#E5E7EB" }}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  accent = false,
  compact = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border ${compact ? "px-2.5 py-1.5" : "px-3 py-2"}`}
      style={{
        borderColor: accent ? "rgba(0, 82, 223, 0.2)" : NL.borderCard,
        background: accent ? NL.chipBg : NL.surfaceMuted,
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: NL.textMuted }}>
        {label}
      </p>
      <p
        className={`font-bold tabular-nums ${compact ? "text-[15px]" : "text-[18px]"}`}
        style={{ color: accent ? CHART_PRIMARY_DEEP : NL.textPrimary }}
      >
        {value}
      </p>
    </div>
  );
}
