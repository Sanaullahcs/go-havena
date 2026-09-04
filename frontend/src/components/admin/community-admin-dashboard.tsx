"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { StatTile } from "@/components/admin/ui";
import NoticeFormModal from "@/components/admin/notice-form-modal";
import { MemberInviteModal } from "@/components/admin/member-invite-modal";
import {
  DashboardHero,
  formatDashboardGeneratedAt,
  LiveBadge,
  ManageLinkCard,
} from "@/components/admin/dashboard/dashboard-shared";
import ReviewQueueSection from "@/components/admin/dashboard/review-queue-section";
import { ComposeRail, COMMUNITY_QUICK_ACTIONS } from "@/components/admin/dashboard/quick-actions-section";
import { DashboardPanel } from "@/components/admin/dashboard/dashboard-panel";
import {
  DashboardActivityChart,
  DashboardMembersBarChart,
  DashboardMembersPieChart,
} from "@/components/admin/dashboard/dashboard-charts";
import {
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  dashIcon,
  FileText,
  MessageSquare,
  ShoppingCart,
  Activity,
  TrendingUp,
  Users,
} from "@/components/admin/dashboard/dashboard-icons";
import {
  fetchAdminStats,
  type AdminDashboardData,
  type AdminDashboardPendingAction,
} from "@/lib/api/dashboard";
import { approveMember, approveFamilyAddMemberRequest, rejectMember, rejectFamilyAddMemberRequest } from "@/lib/api/members";
import { approvePost, rejectPost } from "@/lib/api/posts";
import { approveListing, rejectListing } from "@/lib/api/listings";
import {
  approveNotice,
  rejectNotice,
  createAlert,
  createEvent,
  createNotice,
  type NoticeFormData,
} from "@/lib/api/notices";
import { apiError } from "@/lib/api/client";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { toastError, toastSuccess } from "@/lib/alert";
import { getAdminCache, setAdminCache } from "@/lib/admin/navigation-cache";
import {
  confirmPendingDashboardAction,
  confirmPublishCommunityContent,
  type PendingVerb,
} from "@/lib/admin/dashboard-confirmations";

type CreateKind = "notice" | "event" | "alert" | null;

function relTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function CommunityAdminDashboard() {
  const pathname = usePathname();
  const cached = getAdminCache<AdminDashboardData>("dashboard:community-stats");
  const [data, setData] = useState<AdminDashboardData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);

  const [createKind, setCreateKind] = useState<CreateKind>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const result = await fetchAdminStats();
      setData(result);
      setAdminCache("dashboard:community-stats", result);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || pathname !== "/admin") return;
    void load(Boolean(getAdminCache("dashboard:community-stats")));
  }, [mounted, pathname, load]);

  const handleAction = useCallback(
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
            toastSuccess("Post published");
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

  const inlinePendingTypes = new Set<AdminDashboardPendingAction["type"]>([
    "membership",
    "family_add_member",
    "post",
    "listing",
    "notice",
    "event",
    "alert",
  ]);

  const handleCreate = async (payload: NoticeFormData) => {
    if (!createKind) return;
    const result = await confirmPublishCommunityContent(createKind, payload.title.trim());
    if (!result.isConfirmed) return;

    setCreating(true);
    try {
      if (createKind === "event") {
        await createEvent(payload);
        toastSuccess(payload.scheduled_at ? "Event scheduled" : "Event published");
      } else if (createKind === "alert") {
        await createAlert(payload);
        toastSuccess(payload.scheduled_at ? "Alert scheduled" : "Alert published");
      } else {
        await createNotice(payload);
        toastSuccess(payload.scheduled_at ? "Notice scheduled" : "Notice published");
      }
      setCreateKind(null);
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setCreating(false);
    }
  };

  const kpis = useMemo(() => {
    if (!data) return [];
    const { stats } = data;
    return [
      {
        label: "Total Members",
        value: String(stats.total_members),
        hint: `${stats.pending_members} pending approval`,
        tone: "blue" as const,
        href: "/admin/members",
        icon: dashIcon(Users),
      },
      {
        label: "Pending Review",
        value: String(stats.pending_approval_total),
        hint: `${stats.pending_members} members · ${stats.pending_listings ?? 0} listings · ${stats.pending_posts} posts`,
        tone: "amber" as const,
        href: "/admin/members?status=pending",
        icon: dashIcon(Clock),
      },
      {
        label: "Marketplace",
        value: String(stats.active_listings),
        hint: `${stats.pending_listings ?? 0} awaiting approval`,
        tone: "green" as const,
        href: "/admin/marketplace?status=pending",
        icon: dashIcon(ShoppingCart),
      },
      {
        label: "Community Posts",
        value: String(stats.total_posts),
        hint: `${stats.pending_posts} pending moderation`,
        tone: "violet" as const,
        href: "/admin/feed?status=pending",
        icon: dashIcon(MessageSquare),
      },
    ];
  }, [data]);

  const secondaryKpis = useMemo(() => {
    if (!data) return [];
    const { stats } = data;
    return [
      {
        label: "Published Notices",
        value: String(stats.published_notices),
        hint: "Live announcements",
        tone: "cyan" as const,
        href: "/admin/notices",
        icon: dashIcon(FileText),
      },
      {
        label: "Approved Posts",
        value: String(stats.approved_posts),
        hint: "Visible in community feed",
        tone: "blue" as const,
        href: "/admin/feed",
        icon: dashIcon(CheckCircle2),
      },
      {
        label: "Onboarding",
        value: String(stats.onboarding_members),
        hint: "Residents not yet in a community",
        tone: "slate" as const,
        href: "/admin/members?status=onboarding",
        icon: dashIcon(Users),
      },
      {
        label: "Suspended",
        value: String(stats.banned_members),
        hint: "Banned members",
        tone: "red" as const,
        href: "/admin/members?status=banned",
        icon: dashIcon(Ban),
      },
    ];
  }, [data]);

  const quickActions = useMemo(
    () => [
      { ...COMMUNITY_QUICK_ACTIONS.invite, onClick: () => setInviteOpen(true) },
      { ...COMMUNITY_QUICK_ACTIONS.notice, onClick: () => setCreateKind("notice") },
      { ...COMMUNITY_QUICK_ACTIONS.event, onClick: () => setCreateKind("event") },
      { ...COMMUNITY_QUICK_ACTIONS.alert, onClick: () => setCreateKind("alert") },
    ],
    [],
  );

  if (!mounted) return <PageLoader text="Loading community dashboard…" variant="community" />;
  if (loading && !data) return <PageLoader text="Loading community dashboard…" variant="community" />;
  if ((error && !data) || !data) {
    return <PageError message={error ?? "Unable to load dashboard."} onRetry={() => load()} />;
  }

  const { stats, pending_actions } = data;
  const generatedLabel = formatDashboardGeneratedAt(data.generated_at);

  const manageLinks: {
    label: string;
    href: string;
    desc: string;
    badge?: string;
    tone: "blue" | "amber" | "green" | "cyan" | "violet" | "red";
    icon: React.ReactNode;
  }[] = [
    {
      label: "Residents",
      href: "/admin/members",
      desc: "Approve join requests & manage members",
      badge: stats.pending_members ? `${stats.pending_members} pending` : undefined,
      tone: "blue",
      icon: dashIcon(Users),
    },
    {
      label: "Billing",
      href: "/admin/billing",
      desc: "Plans, seats, and subscription status",
      tone: "cyan",
      icon: dashIcon(Building2),
    },
    {
      label: "Feed Moderation",
      href: "/admin/feed?status=pending",
      desc: "Review resident posts before publishing",
      badge: stats.pending_posts ? `${stats.pending_posts} pending` : undefined,
      tone: "violet",
      icon: dashIcon(MessageSquare),
    },
    {
      label: "Marketplace",
      href: "/admin/marketplace?status=pending",
      desc: "Approve or reject resident listings",
      badge: stats.pending_listings ? `${stats.pending_listings} pending` : undefined,
      tone: "green",
      icon: dashIcon(ShoppingCart),
    },
    {
      label: "Businesses",
      href: "/admin/businesses?status=pending",
      desc: "Approve and manage local businesses",
      tone: "cyan",
      icon: dashIcon(ShoppingCart),
    },
    {
      label: "Notices",
      href: "/admin/notices",
      desc: "Community announcements",
      tone: "cyan",
      icon: dashIcon(FileText),
    },
    {
      label: "Events",
      href: "/admin/events",
      desc: "Schedule community events",
      tone: "violet",
      icon: dashIcon(Calendar),
    },
    {
      label: "Alerts",
      href: "/admin/alerts",
      desc: "Emergency & urgent alerts",
      tone: "red",
      icon: dashIcon(AlertTriangle),
    },
    {
      label: "Amenities",
      href: "/admin/amenities",
      desc: "Publish instantly, approve resident submissions",
      tone: "cyan",
      icon: dashIcon(Building2),
    },
    {
      label: "Book Amenity",
      href: "/admin/amenities?action=book",
      desc: "Reserve a community amenity as admin",
      tone: "green",
      icon: dashIcon(Calendar),
    },
    {
      label: "Booking Request",
      href: "/admin/bookings",
      desc: "Approve booking requests for your amenities",
      tone: "amber",
      icon: dashIcon(Calendar),
    },
  ];

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Community Admin"
        title={data.scope.label}
        description="Manage residents, content, listings, and announcements for your community — all in one place."
        variant="community"
        compact
        generatedAt={generatedLabel}
        refreshing={refreshing}
        onRefresh={() => load(true)}
        badges={
          <>
            <LiveBadge />
          </>
        }
        composeActions={<ComposeRail actions={quickActions} />}
      />

      <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((item) => (
          <StatTile key={item.label} {...item} />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {secondaryKpis.map((item) => (
          <StatTile key={item.label} {...item} />
        ))}
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        <DashboardPanel className="h-full lg:col-span-2" title="Member Growth" description="New memberships by month" icon={TrendingUp} tone="violet" tall>
          <DashboardMembersBarChart data={data.member_growth} />
        </DashboardPanel>
        <DashboardPanel className="h-full" title="Membership Status" description="Current member breakdown" icon={Users} tone="green" tall>
          <DashboardMembersPieChart data={data.member_status} />
        </DashboardPanel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        <DashboardPanel
          className="h-full lg:col-span-2"
          title="Platform Activity"
          description="Actions in the last 7 days"
          icon={Activity}
          tone="blue"
          tall
        >
          <DashboardActivityChart data={data.activity_chart} />
        </DashboardPanel>
        <DashboardPanel
          className="h-full"
          title="Manage Sections"
          description="Jump to full management pages"
          icon={ClipboardList}
          tone="slate"
          tall
        >
          <div className="nl-dashboard-activity-scroll max-h-[21rem] overflow-y-auto pr-1">
            <div className="space-y-2">
              {manageLinks.map((link) => (
                <ManageLinkCard
                  key={link.href}
                  label={link.label}
                  description={link.desc}
                  href={link.href}
                  badge={link.badge}
                  tone={link.tone}
                  icon={link.icon}
                />
              ))}
            </div>
          </div>
        </DashboardPanel>
      </div>

      <ReviewQueueSection
        items={pending_actions}
        relTime={relTime}
        inlineTypes={inlinePendingTypes}
        actionId={actionId}
        onApprove={(action) => handleAction(action, "approve")}
        onReject={(action) => handleAction(action, "reject")}
      />
      </div>

      <MemberInviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSent={() => load(true)}
      />

      <NoticeFormModal
        open={createKind === "notice"}
        mode="create"
        submitting={creating}
        onClose={() => setCreateKind(null)}
        onSubmit={handleCreate}
        defaultCategory="general"
      />
      <NoticeFormModal
        open={createKind === "event"}
        mode="create"
        submitting={creating}
        onClose={() => setCreateKind(null)}
        onSubmit={handleCreate}
        defaultCategory="event"
        lockedCategory="event"
      />
      <NoticeFormModal
        open={createKind === "alert"}
        mode="create"
        submitting={creating}
        onClose={() => setCreateKind(null)}
        onSubmit={handleCreate}
        defaultCategory="emergency"
        lockedCategory="emergency"
      />
    </div>
  );
}
