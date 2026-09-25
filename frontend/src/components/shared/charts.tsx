"use client";

import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { CHART_PRIMARY, CHART_PRIMARY_DEEP, NL } from "@/lib/design-tokens";

/* ─── Custom tooltip ─── */
function NlTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xl">
      {label && <p className="mb-1.5 text-[11.5px] font-semibold text-slate-500">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-[12.5px] font-medium text-slate-900">
          <span className="h-2 w-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span> {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

/* ─── Admin: Community Activity (Area) ─── */
export function AdminActivityChart({
  data,
}: {
  data?: { date: string; count: number }[];
}) {
  const chartData = (data ?? []).map((point) => ({
    day: point.date,
    Activity: point.count,
  }));

  if (chartData.length === 0) {
    return <ChartEmpty message="No activity recorded in the last 7 days" />;
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="gActivity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_PRIMARY} stopOpacity={0.18} />
              <stop offset="95%" stopColor={CHART_PRIMARY} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<NlTooltip />} cursor={{ stroke: "#e2e8f0" }} />
          <Area
            type="monotone"
            dataKey="Activity"
            name="Actions"
            stroke={CHART_PRIMARY}
            strokeWidth={2}
            fill="url(#gActivity)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Admin: New Members per month (Bar) ─── */
export function AdminMembersBarChart({
  data,
}: {
  data?: { month: string; count: number }[];
}) {
  const chartData = (data ?? []).map((point) => ({
    month: point.month,
    new: point.count,
  }));

  if (chartData.length === 0) {
    return <ChartEmpty message="No member growth data yet" />;
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barSize={20} barCategoryGap="35%">
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<NlTooltip />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="new" name="New Members" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={i === chartData.length - 1 ? CHART_PRIMARY : "rgba(27, 79, 138, 0.28)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  approved: "#0D9488",
  pending: "#d97706",
  invitation_sent: "#64748b",
  banned: "#dc2626",
  rejected: "#94a3b8",
  onboarding: CHART_PRIMARY,
};

function formatStatusLabel(status: string) {
  if (status === "invitation_sent") return "Invitation Sent";
  if (status === "approved") return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/* ─── Admin: Member status donut ─── */
export function AdminMembersPieChart({
  data,
}: {
  data?: { status: string; count: number }[];
}) {
  const statusData = (data ?? []).map((item) => ({
    name: formatStatusLabel(item.status),
    value: item.count,
    color: STATUS_COLORS[item.status] ?? "#64748b",
  }));

  const total = statusData.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return <ChartEmpty message="No membership records yet" />;
  }

  return (
    <div className="flex h-[220px] items-center gap-4">
      <ResponsiveContainer width={160} height="100%">
        <PieChart>
          <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={3} strokeWidth={0}>
            {statusData.map((item, i) => <Cell key={i} fill={item.color} />)}
          </Pie>
          <Tooltip content={<NlTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {statusData.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="text-[12px] text-slate-600">{item.name}</span>
            </div>
            <div className="text-right">
              <span className="text-[12.5px] font-semibold text-slate-900">{item.value.toLocaleString()}</span>
              <span className="ml-1 text-[11px] text-slate-400">({Math.round((item.value / total) * 100)}%)</span>
            </div>
          </div>
        ))}
        <p className="pt-1 text-[11px] font-medium text-slate-400">Total: {total.toLocaleString()}</p>
      </div>
    </div>
  );
}

/* ─── Admin: Moderation trend (filed vs resolved) ─── */
export function AdminModerationTrendChart({
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
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barSize={10} barCategoryGap="35%" barGap={3}>
            <CartesianGrid vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<NlTooltip />} cursor={{ fill: "#f8fafc" }} />
            <Bar dataKey="Filed" name="Reports Filed" fill="#fca5a5" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Resolved" name="Reports Resolved" fill="#0D9488" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const typeData = (reportsByType ?? []).map((item) => ({
    type: item.type.charAt(0).toUpperCase() + item.type.slice(1),
    count: item.count,
  }));

  if (typeData.length === 0) {
    return <ChartEmpty message="No moderation data yet" />;
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={typeData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barSize={12}>
          <CartesianGrid horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={80} />
          <Tooltip content={<NlTooltip />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="count" name="Reports" fill="#f87171" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Admin: Communities by region (ranked bar list) ─── */
const REGION_BAR_COLORS = [CHART_PRIMARY_DEEP, CHART_PRIMARY, "#163A66", "#0891b2", NL.success, NL.warning];

export function AdminCommunitiesRegionChart({
  data,
}: {
  data?: { region: string; count: number }[];
}) {
  const rows = (data ?? [])
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  if (rows.length === 0) {
    return <ChartEmpty message="No communities mapped to regions yet" />;
  }

  const total = rows.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(...rows.map((item) => item.count));

  return (
    <div className="flex h-full min-h-[220px] flex-col">
      <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <p className="text-3xl font-bold tabular-nums leading-none text-slate-900">{total.toLocaleString()}</p>
          <p className="mt-1 text-[12px] text-slate-500">
            {total === 1 ? "community" : "communities"} across {rows.length}{" "}
            {rows.length === 1 ? "region" : "regions"}
          </p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: NL.chipBg, color: CHART_PRIMARY_DEEP }}>
          Top region: {rows[0].region}
        </span>
      </div>

      <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
        {rows.map((item, i) => {
          const pct = Math.round((item.count / total) * 100);
          const width = max > 0 ? Math.max(6, (item.count / max) * 100) : 0;
          const color = REGION_BAR_COLORS[i % REGION_BAR_COLORS.length];
          return (
            <div key={item.region} className="group">
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                    style={{ background: color }}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate text-[12.5px] font-medium text-slate-700" title={item.region}>
                    {item.region}
                  </span>
                </div>
                <div className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-[13px] font-bold tabular-nums text-slate-900">
                    {item.count.toLocaleString()}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-400">({pct}%)</span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${color}cc, ${color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center">
      <p className="text-[12.5px] text-slate-400">{message}</p>
    </div>
  );
}

/* ─── Admin: Engagement by category (Horizontal stacked bar) ─── */
const ENGAGEMENT_DATA = [
  { category: "Notices",     reads: 91, shares: 34 },
  { category: "Feed",        reads: 82, shares: 56 },
  { category: "Events",      reads: 88, shares: 42 },
  { category: "Marketplace", reads: 67, shares: 29 },
  { category: "Wellness",    reads: 74, shares: 18 },
  { category: "Reports",     reads: 45, shares: 12 },
];

export function AdminEngagementChart() {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={ENGAGEMENT_DATA} layout="vertical" margin={{ top: 4, right: 16, left: 20, bottom: 0 }} barSize={10}>
          <CartesianGrid horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[0, 140]} />
          <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={<NlTooltip />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="reads"  name="Views"     fill="#bfdbfe" radius={[0, 0, 0, 0]} />
          <Bar dataKey="shares" name="Interactions" fill={CHART_PRIMARY} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Resident: Engagement line (weekly points) ─── */
const RESIDENT_ENGAGEMENT = [
  { week: "W1",  points: 120 },
  { week: "W2",  points: 145 },
  { week: "W3",  points: 98  },
  { week: "W4",  points: 175 },
  { week: "W5",  points: 162 },
  { week: "W6",  points: 190 },
  { week: "W7",  points: 210 },
  { week: "W8",  points: 198 },
];

export function ResidentEngagementChart() {
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={RESIDENT_ENGAGEMENT} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="gEng" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0D9488" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#0D9488" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#f0fdf4" />
          <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <Tooltip content={<NlTooltip />} cursor={{ stroke: "#D1FAF5" }} />
          <Line type="monotone" dataKey="points" name="Community Points" stroke="#0D9488" strokeWidth={2.5} dot={{ r: 3.5, fill: "#0D9488", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Resident: Wellness activities bar ─── */
const WELLNESS_DATA = [
  { activity: "Walk",  sessions: 8,  mins: 240 },
  { activity: "Yoga",  sessions: 4,  mins: 200 },
  { activity: "Gym",   sessions: 6,  mins: 300 },
  { activity: "Swim",  sessions: 2,  mins: 90  },
  { activity: "Run",   sessions: 5,  mins: 175 },
  { activity: "Cycle", sessions: 3,  mins: 150 },
];

export function ResidentWellnessChart() {
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={WELLNESS_DATA} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barSize={18} barCategoryGap="40%">
          <CartesianGrid vertical={false} stroke="#f0fdf4" />
          <XAxis dataKey="activity" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <Tooltip content={<NlTooltip />} cursor={{ fill: "#f0fdf4" }} />
          <Bar dataKey="sessions" name="Sessions" radius={[4, 4, 0, 0]} fill="#14B8A6">
            {WELLNESS_DATA.map((_, i) => (
              <Cell key={i} fill={i % 2 === 0 ? "#0D9488" : "#14B8A6"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ResidentActivityChart({
  data,
}: {
  data: { date: string; posts: number; likes: number }[];
}) {
  const chartData = data.map((point) => ({
    day: point.date,
    Posts: point.posts,
    Likes: point.likes,
  }));

  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gPosts" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B4F8A" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#1B4F8A" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gLikes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#eef2f6" />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
          <Tooltip content={<NlTooltip />} cursor={{ stroke: "#dbe7f3" }} />
          <Area type="monotone" dataKey="Posts" stroke="#1B4F8A" strokeWidth={2.2} fill="url(#gPosts)" />
          <Area type="monotone" dataKey="Likes" stroke="#0d9488" strokeWidth={2} fill="url(#gLikes)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
