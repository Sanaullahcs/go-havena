"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminBadge, StatTile } from "@/components/admin/ui";
import CommunityAdminDashboard from "@/components/admin/community-admin-dashboard";
import {
  DashboardActivityChart,
  DashboardMembersBarChart,
  DashboardMembersPieChart,
  DashboardModerationChart,
  DashboardTopCommunitiesChart,
} from "@/components/admin/dashboard/dashboard-charts";
import {
  Ban,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  dashIcon,
  GraduationCap,
  LayoutGrid,
  MessageSquare,
  Map,
  Shield,
  ShoppingCart,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "@/components/admin/dashboard/dashboard-icons";
import { DashboardPanel } from "@/components/admin/dashboard/dashboard-panel";
import {
  DashboardEmptyState,
  DashboardHero,
  formatDashboardGeneratedAt,
  LiveBadge,
  PendingAlertBanner,
} from "@/components/admin/dashboard/dashboard-shared";
import {
  DashboardActivityItem,
  DashboardPendingCard,
  DashboardQuickAction,
  PendingFilterTabs,
  type PendingFilter,
} from "@/components/admin/dashboard/dashboard-widgets";
import { isSystemAdminUser } from "@/lib/auth/session";
import {
  fetchAdminStats,
  type AdminDashboardData,
  type AdminDashboardPendingAction,
} from "@/lib/api/dashboard";
import { approveMember, approveFamilyAddMemberRequest, rejectMember, rejectFamilyAddMemberRequest } from "@/lib/api/members";
import { approvePost, rejectPost } from "@/lib/api/posts";
import { approveListing, rejectListing } from "@/lib/api/listings";
import { approveNotice, rejectNotice } from "@/lib/api/notices";
import { approveCommunityAdmin, rejectCommunityAdmin } from "@/lib/api/community-admins";
import { apiError } from "@/lib/api/client";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { toastError, toastSuccess } from "@/lib/alert";
import { getAdminCache, setAdminCache } from "@/lib/admin/navigation-cache";
import {
  confirmPendingDashboardAction,
  type PendingVerb,
} from "@/lib/admin/dashboard-confirmations";
import { NL } from "@/lib/design-tokens";

function relTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatGeneratedAt(value?: string) {
  return formatDashboardGeneratedAt(value);
}

function pendingHint(stats: AdminDashboardData["stats"]) {
  const parts: string[] = [];
  if (stats.pending_members) parts.push(`${stats.pending_members} membership${stats.pending_members === 1 ? "" : "s"}`);
  if (stats.pending_community_admins) parts.push(`${stats.pending_community_admins} community admin${stats.pending_community_admins === 1 ? "" : "s"}`);
  if (stats.pending_community_requests) parts.push(`${stats.pending_community_requests} community request${stats.pending_community_requests === 1 ? "" : "s"}`);
  if (stats.pending_posts) parts.push(`${stats.pending_posts} post${stats.pending_posts === 1 ? "" : "s"}`);
  if (stats.onboarding_members) parts.push(`${stats.onboarding_members} onboarding`);
  return parts.length ? parts.join(" · ") : "Nothing awaiting review";
}

const INLINE_PENDING_TYPES = new Set<AdminDashboardPendingAction["type"]>([
  "membership",
  "family_add_member",
  "community_admin",
  "post",
  "listing",
  "notice",
  "event",
  "alert",
]);

export default function AdminOverviewPage() {
  const pathname = usePathname();
  const cached = getAdminCache<AdminDashboardData>("dashboard:stats");
  const [data, setData] = useState<AdminDashboardData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>("all");

  useEffect(() => {
    setIsSystemAdmin(isSystemAdminUser());
    setMounted(true);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const result = await fetchAdminStats();
      setData(result);
      setAdminCache("dashboard:stats", result);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted || pathname !== "/admin" || !isSystemAdmin) return;
    void load(Boolean(getAdminCache("dashboard:stats")));
  }, [mounted, pathname, isSystemAdmin, load]);

  const handlePendingAction = useCallback(
    async (action: AdminDashboardPendingAction, verb: PendingVerb) => {
      const result = await confirmPendingDashboardAction(action, verb);
      if (!result.isConfirmed) return;

      setActionId(action.id);
      try {
        if (action.type === "membership") {
          if (verb === "approve") {
            await approveMember(action.user_id ?? action.id, action.community_id);
            toastSuccess(`${action.title} approved`);
          } else {
            await rejectMember(
              action.user_id ?? action.id,
              String(result.value ?? "").trim(),
              action.community_id,
            );
            toastSuccess(`${action.title}'s request was rejected`);
          }
        } else if (action.type === "family_add_member") {
          if (verb === "approve") {
            await approveFamilyAddMemberRequest(action.id, action.community_id);
            toastSuccess(`${action.title} approved — family head notified`);
          } else {
            await rejectFamilyAddMemberRequest(
              action.id,
              String(result.value ?? "").trim(),
              action.community_id,
            );
            toastSuccess(`${action.title}'s family request was rejected`);
          }
        } else if (action.type === "post") {
          if (verb === "approve") {
            await approvePost(action.id);
            toastSuccess("Post approved and published");
          } else {
            await rejectPost(action.id);
            toastSuccess("Post rejected");
          }
        } else if (action.type === "listing") {
          if (verb === "approve") {
            await approveListing(action.id);
            toastSuccess("Listing approved");
          } else {
            await rejectListing(action.id);
            toastSuccess("Listing rejected");
          }
        } else if (action.type === "community_admin") {
          if (verb === "approve") {
            await approveCommunityAdmin(action.id);
            toastSuccess(`${action.title} approved`);
          } else {
            await rejectCommunityAdmin(action.id);
            toastSuccess(`${action.title}'s application was rejected`);
          }
        } else if (action.type === "notice" || action.type === "event" || action.type === "alert") {
          if (verb === "approve") {
            await approveNotice(action.id);
            toastSuccess(`${action.type === "event" ? "Event" : action.type === "alert" ? "Alert" : "Notice"} approved`);
          } else {
            await rejectNotice(action.id);
            toastSuccess(`${action.type === "event" ? "Event" : action.type === "alert" ? "Alert" : "Notice"} rejected`);
          }
        }
        await load(true);
      } catch (err) {
        toastError(apiError(err));
      } finally {
        setActionId(null);
      }
    },
    [load],
  );

  const primaryKpi = useMemo(() => {
    if (!data) return [];
    const { stats } = data;
    return [
      {
        label: "Total Residents",
        value: String(stats.total_members),
        hint: `${stats.pending_members} pending approval`,
        tone: "blue" as const,
        icon: dashIcon(Users),
        href: "/admin/residents",
      },
      {
        label: "Community Admins",
        value: String(stats.approved_community_admins ?? 0),
        hint: stats.pending_community_admins
          ? `${stats.pending_community_admins} pending review`
          : `${stats.total_communities} communities managed`,
        tone: "violet" as const,
        icon: dashIcon(UserPlus),
        href: "/admin/community-admins",
      },
      {
        label: "Pending Approvals",
        value: String(stats.pending_approval_total),
        hint: pendingHint(stats),
        tone: "amber" as const,
        icon: dashIcon(Clock),
        href: stats.pending_community_admins
          ? "/admin/community-admins?status=pending"
          : "/admin/residents?status=pending",
      },
      {
        label: "Open Reports",
        value: String(stats.open_reports),
        hint: "Require moderation",
        tone: "red" as const,
        icon: dashIcon(Shield),
        href: "/admin/moderation",
      },
    ];
  }, [data]);

  const secondaryKpi = useMemo(() => {
    if (!data) return [];
    const { stats } = data;
    return [
      { label: "Active Listings", value: String(stats.active_listings), hint: `${stats.total_posts} posts`, tone: "green" as const, icon: dashIcon(ShoppingCart) },
      { label: "Communities", value: String(stats.total_communities), hint: `${stats.pending_community_requests} requests`, tone: "violet" as const, icon: dashIcon(Building2), href: "/admin/communities" },
      { label: "Active Regions", value: String(stats.active_regions), hint: "Onboarding regions", tone: "cyan" as const, icon: dashIcon(Map), href: "/admin/regions" },
      {
        label: "Contact Messages",
        value: String(stats.new_contact_submissions ?? 0),
        hint: `${stats.total_contact_submissions ?? 0} total submissions`,
        tone: "blue" as const,
        icon: dashIcon(MessageSquare),
        href: "/admin/contact-messages",
      },
      { label: "Onboarding", value: String(stats.onboarding_members), hint: "Profile setup", tone: "cyan" as const, icon: dashIcon(UserCheck), href: "/admin/residents?status=onboarding" },
      { label: "Suspended", value: String(stats.banned_members), hint: "Banned members", tone: "slate" as const, icon: dashIcon(Ban), href: "/admin/residents?status=banned" },
    ];
  }, [data]);

  if (!mounted) return <PageLoader text="Loading dashboard…" skeleton />;
  if (!isSystemAdmin) return <CommunityAdminDashboard />;

  if (loading && !data) return <PageLoader text="Loading dashboard…" skeleton />;
  if ((error && !data) || !data) {
    return <PageError message={error ?? "Unable to load dashboard."} onRetry={() => load()} />;
  }

  const { stats, pending_actions } = data;
  const generatedLabel = formatGeneratedAt(data.generated_at);

  const pendingCounts: Record<PendingFilter, number> = {
    all: pending_actions.length,
    membership: pending_actions.filter((a) => a.type === "membership" || a.type === "family_add_member").length,
    community_admin: pending_actions.filter((a) => a.type === "community_admin").length,
    community_request: pending_actions.filter((a) => a.type === "community_request").length,
    post: pending_actions.filter((a) => a.type === "post").length,
    listing: pending_actions.filter((a) => a.type === "listing").length,
    notice: pending_actions.filter((a) => a.type === "notice").length,
    event: pending_actions.filter((a) => a.type === "event").length,
    alert: pending_actions.filter((a) => a.type === "alert").length,
  };

  const filteredPending =
    pendingFilter === "all"
      ? pending_actions
      : pendingFilter === "membership"
        ? pending_actions.filter(
            (action) => action.type === "membership" || action.type === "family_add_member",
          )
        : pending_actions.filter((action) => action.type === pendingFilter);

  const quickLinks = [
    { label: "Community Admins", href: "/admin/community-admins", tone: "violet" as const, badge: stats.pending_community_admins ? `${stats.pending_community_admins} pending` : undefined, icon: UserPlus },
    { label: "Residents", href: "/admin/residents", tone: "blue" as const, badge: stats.pending_members ? `${stats.pending_members} pending` : undefined, icon: Users },
    { label: "Communities", href: "/admin/communities", tone: "violet" as const, badge: stats.pending_community_requests ? `${stats.pending_community_requests} requests` : undefined, icon: Building2 },
    { label: "Regions", href: "/admin/regions", tone: "cyan" as const, icon: Map },
    { label: "Contact Messages", href: "/admin/contact-messages", tone: "blue" as const, badge: stats.new_contact_submissions ? `${stats.new_contact_submissions} new` : undefined, icon: MessageSquare },
    { label: "Wellness Programs", href: "/admin/wellness", tone: "green" as const, icon: GraduationCap },
    { label: "Moderation", href: "/admin/moderation", tone: "red" as const, badge: stats.open_reports ? `${stats.open_reports} open` : undefined, icon: Shield },
    { label: "Activity Logs", href: "/admin/activity", tone: "slate" as const, icon: ClipboardList },
  ];

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="System Dashboard"
        title="Platform Analytics"
        description="Live overview of users, communities, moderation, and platform activity across all regions."
        variant="system"
        generatedAt={generatedLabel}
        refreshing={refreshing}
        onRefresh={() => load(true)}
        badges={
          <>
            <LiveBadge />
            <AdminBadge tone="blue">{data.scope.label}</AdminBadge>
          </>
        }
      />

      {stats.pending_approval_total > 0 ? (
        <PendingAlertBanner>
          <span className="font-semibold">
            {stats.pending_approval_total} item{stats.pending_approval_total === 1 ? "" : "s"} need your review
          </span>
          {" — "}
          {stats.pending_members} resident approval{stats.pending_members === 1 ? "" : "s"}
          {(stats.pending_community_admins ?? 0) > 0
            ? `, ${stats.pending_community_admins} community admin${stats.pending_community_admins === 1 ? "" : "s"}`
            : ""}
          {stats.pending_community_requests
            ? ` and ${stats.pending_community_requests} community request${stats.pending_community_requests === 1 ? "" : "s"}`
            : ""}
          .
        </PendingAlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {primaryKpi.map((item) => (
          <StatTile key={item.label} {...item} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {secondaryKpi.map((item) => (
          <StatTile key={item.label} {...item} />
        ))}
      </div>

      <div className="nl-grid-12 items-stretch gap-5">
        <DashboardPanel
          className="col-span-12 h-full xl:col-span-8"
          title="Daily Activity"
          description="Platform actions over the last 7 days"
          icon={TrendingUp}
          tone="blue"
          tall
        >
          <DashboardActivityChart data={data.activity_chart} />
        </DashboardPanel>

        <DashboardPanel
          className="col-span-12 h-full xl:col-span-4"
          title="Membership Mix"
          description="Current resident status distribution"
          icon={Users}
          tone="green"
          tall
        >
          <DashboardMembersPieChart data={data.member_status} />
        </DashboardPanel>
      </div>

      <div className="nl-grid-12 items-stretch gap-5">
        <DashboardPanel
          className="col-span-12 h-full lg:col-span-6"
          title="Member Growth"
          description="New memberships by month"
          icon={UserPlus}
          tone="violet"
          tall
        >
          <DashboardMembersBarChart data={data.member_growth} />
        </DashboardPanel>

        <DashboardPanel
          className="col-span-12 h-full lg:col-span-6"
          title="Moderation Pulse"
          description="Reports filed vs resolved"
          icon={Shield}
          tone="red"
          tall
        >
          <DashboardModerationChart data={data.reports_trend} reportsByType={data.reports_by_type} />
        </DashboardPanel>
      </div>

      <div className="nl-grid-12 nl-dashboard-paired-row min-h-0 items-stretch gap-5">
        <div className="col-span-12 flex min-h-0 flex-col xl:col-span-7">
          <DashboardPanel
            className="nl-dashboard-paired-panel h-full min-h-0 flex-1"
            title="Top Communities"
            description="By resident count"
            icon={Building2}
            tone="cyan"
            compact
            fillBody
            action={
              <Link href="/admin/communities" className="text-[12px] font-semibold text-slate-500 transition hover:text-blue-600">
                View all
              </Link>
            }
          >
            <DashboardTopCommunitiesChart data={data.top_communities_by_members ?? []} />
          </DashboardPanel>
        </div>

        <div className="col-span-12 flex min-h-0 flex-col xl:col-span-5">
          <DashboardPanel
            className="nl-dashboard-paired-panel h-full min-h-0 flex-1"
            title="Quick Actions"
            description="Admin shortcuts"
            icon={LayoutGrid}
            tone="blue"
            compact
            fillBody
          >
            <div className="nl-dashboard-quick-actions-grid grid h-full min-h-0 grid-cols-1 gap-1.5 sm:grid-cols-2">
              {quickLinks.map((link) => (
                <DashboardQuickAction key={link.href} {...link} />
              ))}
            </div>
          </DashboardPanel>
        </div>
      </div>

      <div className="nl-grid-12 nl-dashboard-equal-row min-h-0 items-stretch gap-5">
        <div className="col-span-12 flex min-h-0 flex-col lg:col-span-6">
        <DashboardPanel
          className="h-full min-h-0 flex-1"
          title="Recent Activity"
          description="Latest platform events"
          icon={ClipboardList}
          tone="slate"
          scrollBody
          action={
            <Link href="/admin/activity" className="text-[12px] font-bold hover:opacity-80" style={{ color: NL.link }}>
              View all →
            </Link>
          }
        >
          {data.recent_activity.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <DashboardEmptyState
                title="No activity recorded yet"
                description="Platform events will appear here as admins and users take action."
              />
            </div>
          ) : (
            <div className="space-y-3 border-l-2 pl-2" style={{ borderColor: NL.borderCard }}>
              {data.recent_activity.map((log) => (
                <DashboardActivityItem
                  key={log.id}
                  userName={log.user_name ?? "System"}
                  description={log.description}
                  action={log.action}
                  severity={log.severity}
                  relTime={relTime(log.created_at)}
                />
              ))}
            </div>
          )}
        </DashboardPanel>
        </div>

        <div className="col-span-12 flex min-h-0 flex-col lg:col-span-6">
        <DashboardPanel
          className="h-full min-h-0 flex-1"
          title="Pending Approvals"
          description="Review items awaiting admin decision"
          icon={Clock}
          tone="amber"
          scrollBody
          action={
            <PendingFilterTabs value={pendingFilter} onChange={setPendingFilter} counts={pendingCounts} />
          }
        >
          {filteredPending.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <DashboardEmptyState
                title="All caught up"
                description="No items in this queue right now."
                icon={<CheckCircle2 className="h-5 w-5" strokeWidth={2} />}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPending.map((action) => (
                <DashboardPendingCard key={`${action.type}-${action.id}`} action={action} relTime={relTime(action.created_at)}>
                  {INLINE_PENDING_TYPES.has(action.type) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={actionId === action.id}
                        onClick={() => handlePendingAction(action, "reject")}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={actionId === action.id}
                        onClick={() => handlePendingAction(action, "approve")}
                        className="nl-btn-primary !py-2 !text-[12px]"
                      >
                        {actionId === action.id
                          ? "Working…"
                          : action.type === "post"
                            ? "Publish"
                            : "Approve"}
                      </button>
                    </div>
                  ) : null}
                  <Link
                    href={action.action_href}
                    className="rounded-xl border bg-white px-3 py-2 text-[12px] font-semibold transition hover:shadow-sm"
                    style={{ borderColor: NL.borderCard, color: NL.textBody }}
                  >
                    {action.action_label}
                  </Link>
                </DashboardPendingCard>
              ))}
            </div>
          )}
        </DashboardPanel>
        </div>
      </div>
    </div>
  );
}
