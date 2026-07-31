"use client";

import { AdminBadge, AdminPanel, StatTile } from "@/components/admin/ui";

const STATS = [
  { label: "Monthly Active",    value: "892",  hint: "Unique residents (Jun)",       tone: "blue"   as const, icon: <IcoUsers /> },
  { label: "Engagement Rate",   value: "78%",  hint: "+4.2% vs last month",          tone: "green"  as const, icon: <IcoActivity /> },
  { label: "Avg. Session",      value: "4m 12s", hint: "Per daily visit",             tone: "violet" as const, icon: <IcoClock /> },
  { label: "Notices Open Rate", value: "71%",  hint: "7-day average",                tone: "cyan"   as const, icon: <IcoMail /> },
  { label: "Feed Posts",        value: "1,340", hint: "This month",                  tone: "blue"   as const, icon: <IcoFeed /> },
  { label: "Marketplace Sales", value: "₨ 2.4M", hint: "Total GMV (Jun)",           tone: "green"  as const, icon: <IcoMarket /> },
  { label: "Avg. Response Time","value": "38m", hint: "Admin moderation response",   tone: "amber"  as const, icon: <IcoShield /> },
  { label: "New Members",       value: "124",  hint: "Joined this month",            tone: "blue"   as const, icon: <IcoPlus /> },
];

const ENGAGEMENT_WEEKLY = [
  { day: "Mon", posts: 84,  notices: 12, market: 28 },
  { day: "Tue", posts: 102, notices: 9,  market: 35 },
  { day: "Wed", posts: 78,  notices: 14, market: 22 },
  { day: "Thu", posts: 125, notices: 18, market: 41 },
  { day: "Fri", posts: 143, notices: 22, market: 58 },
  { day: "Sat", posts: 167, notices: 10, market: 73 },
  { day: "Sun", posts: 92,  notices: 7,  market: 31 },
];

const MAX_POSTS = Math.max(...ENGAGEMENT_WEEKLY.map((d) => d.posts));

const TOP_CONTRIBUTORS = [
  { name: "Fatima Noor",  posts: 48, likes: 312, role: "Moderator" },
  { name: "Sara Ahmed",   posts: 37, likes: 241, role: "Resident"  },
  { name: "Omar Khalid",  posts: 29, likes: 198, role: "Resident"  },
  { name: "Ali Hassan",   posts: 24, likes: 167, role: "Resident"  },
  { name: "Zainab Malik", posts: 21, likes: 143, role: "Resident"  },
];

const CATEGORY_STATS = [
  { name: "Community Feed",  count: 1340, pct: 45, color: "#2563eb" },
  { name: "Marketplace",     count: 890,  pct: 30, color: "#0891b2" },
  { name: "Notices",         count: 430,  pct: 14, color: "#7c3aed" },
  { name: "Events",          count: 220,  pct: 7,  color: "#059669" },
  { name: "Wellness",        count: 120,  pct: 4,  color: "#d97706" },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Insights</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Analytics</h2>
          <p className="mt-1 text-sm text-slate-500">Community engagement, growth metrics, and activity patterns.</p>
        </div>
        <div className="flex items-center gap-2">
          <AdminBadge tone="green">● Live Data</AdminBadge>
          <AdminBadge tone="blue">Jun 2026</AdminBadge>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      {/* Main grid */}
      <div className="grid gap-5 xl:grid-cols-3">

        {/* Weekly bar chart */}
        <AdminPanel
          title="Weekly Activity"
          description="Posts, notices, and marketplace interactions."
          className="xl:col-span-2"
        >
          <div className="mt-2 flex items-end justify-between gap-2 h-40">
            {ENGAGEMENT_WEEKLY.map(({ day, posts }) => {
              const height = Math.round((posts / MAX_POSTS) * 100);
              return (
                <div key={day} className="group flex flex-1 flex-col items-center gap-1.5">
                  <p className="text-[11px] font-semibold tabular-nums text-slate-600 opacity-0 transition group-hover:opacity-100">
                    {posts}
                  </p>
                  <div className="relative flex w-full justify-center">
                    <div
                      className="w-full max-w-[28px] rounded-t-md bg-blue-600 transition-all duration-300 hover:bg-blue-700"
                      style={{ height: `${Math.max(height, 8)}%`, minHeight: 8 }}
                      title={`${posts} posts`}
                    />
                  </div>
                  <p className="text-[11px] font-medium text-slate-400">{day}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3">
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Posts
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> Notices
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" /> Marketplace
            </span>
          </div>
        </AdminPanel>

        {/* Category breakdown */}
        <AdminPanel title="Activity by Section" description="Where residents spend their time.">
          <div className="space-y-3">
            {CATEGORY_STATS.map(({ name, count, pct, color }) => (
              <div key={name}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[13px] font-medium text-slate-700">{name}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] tabular-nums text-slate-500">{count.toLocaleString()}</p>
                    <p className="text-[11px] font-semibold tabular-nums text-slate-400">{pct}%</p>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AdminPanel>
      </div>

      {/* Top contributors */}
      <AdminPanel title="Top Contributors" description="Most active community members this month.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">#</th>
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Member</th>
                <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Role</th>
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Posts</th>
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Likes</th>
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TOP_CONTRIBUTORS.map(({ name, posts, likes, role }, i) => {
                const score = posts * 3 + likes;
                const colors = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#0891b2"];
                return (
                  <tr key={name} className="hover:bg-slate-50/60">
                    <td className="py-3 pr-4 text-[13px] font-bold text-slate-400">#{i + 1}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: colors[i] }}
                        >
                          {name[0]}
                        </span>
                        <p className="font-medium text-slate-900">{name}</p>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-[13px] text-slate-500">{role}</td>
                    <td className="py-3 pr-4 text-right text-[13px] tabular-nums font-medium text-slate-800">{posts}</td>
                    <td className="py-3 pr-4 text-right text-[13px] tabular-nums text-slate-600">{likes}</td>
                    <td className="py-3 text-right">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                        {score}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </div>
  );
}

function IcoUsers()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="18.5" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.6" /><path d="M16 20c0-2.2 1.3-4 3-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>; }
function IcoActivity() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IcoClock()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IcoMail()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IcoFeed()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M7 8h10M7 12h6M7 16h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcoMarket()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 8h12l-1.2 11H7.2L6 8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcoShield()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 3l8 3v6c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V6l8-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>; }
function IcoPlus()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
