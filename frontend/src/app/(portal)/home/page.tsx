"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getResidentCommunityId,
  getResidentCommunityName,
  getUser,
} from "@/lib/auth/session";
import { fetchResidentStats } from "@/lib/api/dashboard";
import { fetchNotices, categoryLabel, type Notice } from "@/lib/api/notices";
import { apiError } from "@/lib/api/client";
import { PageLoader } from "@/components/shared/page-states";
import { ResidentEngagementChart } from "@/components/shared/charts";

type ResidentStats = {
  my_stats?: {
    posts?: number;
    bookings?: number;
    saved_listings?: number;
    likes_given?: number;
    unread_notifs?: number;
  };
  community_stats?: {
    total_members?: number;
    total_posts?: number;
  };
  recent_notices?: Array<Record<string, unknown>>;
  personal_activity?: Array<{ date: string; posts?: number; likes?: number }>;
};

const QUICK_LINKS = [
  { title: "Community Notices", href: "/notices", color: "#7c3aed", Icon: IcoNotice },
  { title: "Community Feed", href: "/feed", color: "#1B4F8A", Icon: IcoFeed },
  { title: "Wellness Programs", href: "/wellness", color: "#059669", Icon: IcoHeart },
  { title: "Marketplace", href: "/marketplace", color: "#0891b2", Icon: IcoMarket },
  { title: "Property & Amenities", href: "/property", color: "#d97706", Icon: IcoBuild },
  { title: "My Profile", href: "/profile", color: "#64748b", Icon: IcoUser },
];

const CATEGORY_COLOR: Record<string, string> = {
  event: "#7c3aed",
  maintenance: "#d97706",
  general: "#64748b",
  security: "#dc2626",
  finance: "#0891b2",
  emergency: "#b91c1c",
};

function noticeColor(category?: string) {
  return CATEGORY_COLOR[(category ?? "").toLowerCase()] ?? "#64748b";
}

function formatNoticeDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ResidentHomePage() {
  const user = getUser();
  const name = user?.name || user?.profile?.display_name || user?.email?.split("@")[0] || "Neighbor";
  const communityName = getResidentCommunityName(user) || "Your community";
  const today = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    [],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ResidentStats | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    let cancelled = false;
    const communityId = getResidentCommunityId();

    (async () => {
      try {
        const [statsPayload, noticesPayload] = await Promise.all([
          fetchResidentStats(communityId ? { community_id: communityId } : undefined),
          fetchNotices({ status: "published", per_page: 3 }),
        ]);
        if (cancelled) return;
        setStats(statsPayload as ResidentStats);
        setNotices(noticesPayload.data ?? []);
      } catch (err) {
        if (!cancelled) setError(apiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const my = stats?.my_stats ?? {};
  const community = stats?.community_stats ?? {};
  const activity = (stats?.personal_activity ?? []).map((row) => ({
    week: row.date,
    points: (row.posts ?? 0) + (row.likes ?? 0),
  }));
  const weekTotal = activity.reduce((sum, row) => sum + row.points, 0);

  const statCards = [
    { label: "Your posts", value: String(my.posts ?? 0), sub: "In the community feed", color: "#1B4F8A" },
    { label: "Bookings", value: String(my.bookings ?? 0), sub: "Active amenity bookings", color: "#d97706" },
    { label: "Saved listings", value: String(my.saved_listings ?? 0), sub: "Marketplace saves", color: "#0891b2" },
    { label: "Neighbors", value: String(community.total_members ?? "—"), sub: "Approved members", color: "#059669" },
  ];

  const recentNotices =
    notices.length > 0
      ? notices
      : (stats?.recent_notices ?? []).map((row) => ({
          id: Number(row.id ?? 0),
          title: String(row.title ?? "Notice"),
          category: String(row.category ?? "general"),
          published_at: (row.published_at as string | null) ?? null,
        }));

  if (loading) {
    return <PageLoader text="Loading your community…" skeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 w-full" style={{ background: "#1B4F8A" }} />
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="nl-eyebrow" style={{ color: "#059669" }}>Resident Portal</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Welcome back, {name}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {communityName} · {today}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700">
              {name[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-900">{name}</p>
              <p className="text-[12px] text-emerald-600">{communityName}</p>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some home stats could not be loaded. {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
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

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="nl-panel overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">My activity</h3>
                <p className="mt-0.5 text-[13px] text-slate-500">Posts and likes over the last 7 days.</p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700">
                {weekTotal} this week
              </span>
            </div>
          </div>
          <div className="px-5 py-4">
            <ResidentEngagementChart data={activity} />
          </div>
        </div>

        <div className="nl-panel overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">Community</h3>
                <p className="mt-0.5 text-[13px] text-slate-500">What your neighbors have been doing.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-slate-600">
                {community.total_posts ?? 0} posts
              </span>
            </div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {QUICK_LINKS.slice(0, 4).map(({ title, href, color, Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3.5 transition hover:border-slate-200 hover:bg-white hover:shadow-sm"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ background: color }}
                >
                  <Icon />
                </span>
                <p className="truncate text-[13.5px] font-semibold text-slate-800">{title}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="nl-panel overflow-hidden xl:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-[15px] font-semibold text-slate-900">Your community</h3>
            <p className="mt-0.5 text-[13px] text-slate-500">Jump to any section of the portal.</p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {QUICK_LINKS.map(({ title, href, color, Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3.5 transition hover:border-slate-200 hover:bg-white hover:shadow-sm"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ background: color }}
                >
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-slate-800 group-hover:text-slate-900">
                    {title}
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-400">
                  <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}
          </div>
        </div>

        <div className="nl-panel overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-[15px] font-semibold text-slate-900">Recent notices</h3>
            <p className="mt-0.5 text-[13px] text-slate-500">Latest from {communityName}.</p>
          </div>
          <div className="divide-y divide-slate-100 p-3">
            {recentNotices.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-slate-400">No published notices yet.</p>
            ) : (
              recentNotices.slice(0, 3).map((n) => (
                <Link
                  key={n.id || n.title}
                  href="/notices"
                  className="group flex items-start gap-3 rounded-lg px-2 py-3 transition hover:bg-slate-50"
                >
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
                    style={{ background: noticeColor(n.category) }}
                  >
                    <IcoNotice />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-medium text-slate-800 group-hover:text-emerald-700">
                      {n.title}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: noticeColor(n.category) }}>
                        {categoryLabel(n.category)}
                      </span>
                      <span className="text-[11px] text-slate-400">{formatNoticeDate(n.published_at)}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
            <div className="px-2 pt-3">
              <Link href="/notices" className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-700">
                View all notices →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IcoNotice() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[18px] w-[18px]"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcoFeed()   { return <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[18px] w-[18px]"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" /><path d="M3 20c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M15 12h6M15 16h4M15 20h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcoHeart()  { return <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[18px] w-[18px]"><path d="M12 21C8 18 3 14 3 8.5A4.5 4.5 0 0112 6a4.5 4.5 0 019 2.5c0 5.5-5 9.5-9 12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>; }
function IcoMarket() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[18px] w-[18px]"><path d="M6 8h12l-1.2 11H7.2L6 8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcoBuild()  { return <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[18px] w-[18px]"><path d="M3 21V9l9-6 9 6v12H3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>; }
function IcoUser()   { return <svg viewBox="0 0 24 24" fill="none" aria-hidden className="h-[18px] w-[18px]"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" /><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
