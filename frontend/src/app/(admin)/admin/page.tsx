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
  DashboardQuickAction,
  PendingApprovalsPanel,
} from "@/components/admin/dashboard/dashboard-widgets";
import { isSystemAdminUser } from "@/lib/auth/session";
import {
  fetchAdminStats,
  type AdminDashboardData,
  type AdminDashboardPendingAction,
} from "@/lib/api/dashboard";
import { approveMember, approveFamilyAddMemberRequest, rejectMember, rejectFamilyAddMemberRequest } from "@/lib/api/members";
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
import { formatPhonesInText } from "@/lib/phone/format";

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
  if (stats.onboarding_members) parts.push(`${stats.onboarding_members} onboarding`);
  return parts.length ? parts.join(" · ") : "Nothing awaiting review";
}

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

  if (!mounted) return <PageLoader text="Loading dashboard…" variant="dashboard" />;
  if (!isSystemAdmin) return <CommunityAdminDashboard />;

  if (loading && !data) return <PageLoader text="Loading dashboard…" variant="dashboard" />;
  if ((error && !data) || !data) {
    return <PageError message={error ?? "Unable to load dashboard."} onRetry={() => load()} />;
  }

  const { stats } = data;
  const generatedLabel = formatGeneratedAt(data.generated_at);

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
    <div className="space-y-4">
      <DashboardHero
        eyebrow="System Dashboard"
        title="Platform Analytics"
        description="Live overview of users, communities, moderation, and platform activity across all regions."
        variant="system"
        compact
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
        <PendingAlertBanner href="#pending-approvals">
          <span className="font-semibold">
            {stats.pending_approval_total} item{stats.pending_approval_total === 1 ? "" : "s"} need your review
          </span>
          {" — "}
          {stats.pending_members > 0 ? (
            <Link href="/admin/residents?status=pending" className="font-semibold underline decoration-amber-400/70 underline-offset-2 hover:text-amber-950">
              {stats.pending_members} resident approval{stats.pending_members === 1 ? "" : "s"}
            </Link>
          ) : (
            <>{stats.pending_members} resident approval{stats.pending_members === 1 ? "" : "s"}</>
          )}
          {(stats.pending_community_admins ?? 0) > 0 ? (
            <>
              {", "}
              <Link href="/admin/community-admins?status=pending" className="font-semibold underline decoration-amber-400/70 underline-offset-2 hover:text-amber-950">
                {stats.pending_community_admins} community admin{stats.pending_community_admins === 1 ? "" : "s"}
              </Link>
            </>
          ) : null}
          {stats.pending_community_requests ? (
            <>
              {" and "}
              <Link href="/admin/communities?tab=requests" className="font-semibold underline decoration-amber-400/70 underline-offset-2 hover:text-amber-950">
                {stats.pending_community_requests} community request{stats.pending_community_requests === 1 ? "" : "s"}
              </Link>
            </>
          ) : null}
          .
        </PendingAlertBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {[...primaryKpi, ...secondaryKpi].map((item) => (
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
                  userName={formatPhonesInText(log.user_name) || log.user_name || "System"}
                  description={formatPhonesInText(log.description) || log.description}
                  action={log.action}
                  severity={log.severity}
                  relTime={relTime(log.created_at)}
                />
              ))}
            </div>
          )}
        </DashboardPanel>
        </div>

        <div id="pending-approvals" className="col-span-12 flex min-h-0 flex-col scroll-mt-20 lg:col-span-6">
          <PendingApprovalsPanel
            actions={data.pending_actions}
            actionId={actionId}
            onApprove={(action) => handlePendingAction(action, "approve")}
            onReject={(action) => handlePendingAction(action, "reject")}
          />
        </div>
      </div>
    </div>
  );
}
