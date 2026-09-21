"use client";

import Link from "next/link";
import { getUser } from "@/lib/auth/session";
import { formatAccountDisplayName } from "@/lib/user/email-display";
import { ResidentEngagementChart, ResidentWellnessChart } from "@/components/shared/charts";
import { anyResidentFeatureEnabled, isResidentFeatureEnabled } from "@/lib/resident-features";

const QUICK_LINKS = [
  { title: "Community Notices",   sub: "3 new announcements",         href: "/notices",     color: "#7c3aed", Icon: IcoNotice  },
  { title: "Community Feed",      sub: "12 new posts today",          href: "/feed",        color: "#1B4F8A", Icon: IcoFeed    },
  { title: "Wellness Programs", sub: "2 courses in progress",       href: "/wellness",    color: "#059669", Icon: IcoHeart   },
  { title: "Marketplace",         sub: "5 deals nearby",              href: "/marketplace", color: "#0891b2", Icon: IcoMarket  },
  { title: "Property & Amenities",sub: "Pool open 6am–10pm",          href: "/property",    color: "#d97706", Icon: IcoBuild   },
  { title: "My Profile",          sub: "482 community points",        href: "/profile",     color: "#64748b", Icon: IcoUser    },
];

const RECENT_NOTICES = [
  { title: "Community BBQ — This Saturday!",   date: "Jun 20", category: "Event",       color: "#7c3aed" },
  { title: "Water maintenance 10am–2pm",       date: "Jun 18", category: "Maintenance", color: "#d97706" },
  { title: "Welcome to new residents",         date: "Jun 15", category: "General",     color: "#64748b" },
];

const STATS = [
  { label: "Points",           value: "482",  sub: "+24 this week",  color: "#7c3aed" },
  { label: "Feed Posts",       value: "18",   sub: "You posted",     color: "#1B4F8A" },
  { label: "Wellness Streak",  value: "7d",   sub: "Keep it up!",    color: "#059669" },
  { label: "Marketplace Saved",value: "5",    sub: "Saved listings", color: "#0891b2" },
];

export default function ResidentHomePage() {
  const user = getUser();
  const name = formatAccountDisplayName(user, "Neighbor");
  const features = user?.resident_features;
  const showNotices = anyResidentFeatureEnabled(features, ["notices", "events", "alerts"]);
  const showFeed = isResidentFeatureEnabled(features, "feed");
  const showWellness = isResidentFeatureEnabled(features, "wellness");
  const showMarketplace = isResidentFeatureEnabled(features, "marketplace");
  const showProperty = anyResidentFeatureEnabled(features, ["amenities", "bookings", "documents", "community_rules"]);
  const showPoints = isResidentFeatureEnabled(features, "points");

  const quickLinks = QUICK_LINKS.filter((link) => {
    if (link.href === "/notices") return showNotices;
    if (link.href === "/feed") return showFeed;
    if (link.href === "/wellness") return showWellness;
    if (link.href === "/marketplace") return showMarketplace;
    if (link.href === "/property") return showProperty;
    return true;
  });

  const stats = STATS.filter((stat) => {
    if (stat.label === "Points") return showPoints;
    if (stat.label === "Feed Posts") return showFeed;
    if (stat.label === "Wellness Streak") return showWellness;
    if (stat.label === "Marketplace Saved") return showMarketplace;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 w-full" style={{ background: "#1B4F8A" }} />
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="nl-eyebrow" style={{ color: "#059669" }}>Resident Portal</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Welcome back, {name} 👋
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Sunflower Heights Estate · Monday, June 22, 2026
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700">
              {name[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-900">{name}</p>
              {showPoints ? <p className="text-[12px] text-emerald-600">482 community points</p> : null}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="group relative flex h-[4.5rem] items-center gap-3 overflow-hidden rounded-xl border border-slate-200/70 bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="absolute inset-x-0 top-0 h-[2.5px]" style={{ background: s.color }} />
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[14px] font-bold text-white"
              style={{ background: s.color }}
            >
              {s.value}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
              <p className="text-[12px] text-slate-400">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {showPoints ? <div className="nl-panel overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">My Engagement</h3>
                <p className="mt-0.5 text-[13px] text-slate-500">Community points earned (8 weeks).</p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700">
                +24 this week
              </span>
            </div>
          </div>
          <div className="px-5 py-4">
            <ResidentEngagementChart />
          </div>
        </div> : null}

        {showWellness ? <div className="nl-panel overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">Wellness Activities</h3>
                <p className="mt-0.5 text-[13px] text-slate-500">Sessions completed this month.</p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700">
                28 sessions
              </span>
            </div>
          </div>
          <div className="px-5 py-4">
            <ResidentWellnessChart />
          </div>
        </div> : null}
      </div>

      {/* Main grid */}
      <div className="grid gap-5 xl:grid-cols-3">
        {/* Quick links */}
        <div className="nl-panel overflow-hidden xl:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-[15px] font-semibold text-slate-900">Your Community</h3>
            <p className="mt-0.5 text-[13px] text-slate-500">Jump to any section of the portal.</p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {quickLinks.map(({ title, sub, href, color, Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3.5 transition hover:border-slate-200 hover:bg-white hover:shadow-sm"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white [&_svg]:h-4.5 [&_svg]:w-4.5"
                  style={{ background: color }}
                >
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-slate-800 group-hover:text-slate-900">
                    {title}
                  </p>
                  <p className="truncate text-[12px] text-slate-400">{sub}</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-400">
                  <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent notices */}
        {showNotices ? <div className="nl-panel overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-[15px] font-semibold text-slate-900">Recent Notices</h3>
            <p className="mt-0.5 text-[13px] text-slate-500">Latest from your community.</p>
          </div>
          <div className="divide-y divide-slate-100 p-3">
            {RECENT_NOTICES.map((n) => (
              <Link
                key={n.title}
                href="/notices"
                className="group flex items-start gap-3 rounded-lg px-2 py-3 transition hover:bg-slate-50"
              >
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white [&_svg]:h-3 [&_svg]:w-3"
                  style={{ background: n.color }}
                >
                  <IcoNotice />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-800 group-hover:text-emerald-700 line-clamp-2">{n.title}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: n.color }}>
                      {n.category}
                    </span>
                    <span className="text-[11px] text-slate-400">{n.date}</span>
                  </div>
                </div>
              </Link>
            ))}
            <div className="px-2 pt-3">
              <Link href="/notices" className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-700">
                View all notices →
              </Link>
            </div>
          </div>
        </div> : null}
      </div>
    </div>
  );
}

function IcoNotice() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcoFeed()   { return <svg viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" /><path d="M3 20c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M15 12h6M15 16h4M15 20h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcoHeart()  { return <svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 21C8 18 3 14 3 8.5A4.5 4.5 0 0112 6a4.5 4.5 0 019 2.5c0 5.5-5 9.5-9 12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>; }
function IcoMarket() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 8h12l-1.2 11H7.2L6 8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcoBuild()  { return <svg viewBox="0 0 24 24" fill="none" aria-hidden><path d="M3 21V9l9-6 9 6v12H3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>; }
function IcoUser()   { return <svg viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" /><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
