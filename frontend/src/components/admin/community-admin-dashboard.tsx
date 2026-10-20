"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NoticeFormModal from "@/components/admin/notice-form-modal";
import { MemberInviteModal } from "@/components/admin/member-invite-modal";
import {
  DashboardHero,
  formatDashboardGeneratedAt,
  LiveBadge,
  ManageLinkCard,
} from "@/components/admin/dashboard/dashboard-shared";
import ReviewQueueSection, {
  ADMIN_REVIEW_QUEUE_ID,
} from "@/components/admin/dashboard/review-queue-section";
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
  ClipboardList,
  Clock,
  dashIcon,
  FileText,
  MessageSquare,
  ShoppingCart,
  Activity,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from "@/components/admin/dashboard/dashboard-icons";
import { NL } from "@/lib/design-tokens";
import type { AdminTone } from "@/lib/admin/admin-tones";
import { ADMIN_TONE } from "@/lib/admin/admin-tones";
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
import { getUser } from "@/lib/auth/session";
import { FEATURES_UPDATED_EVENT } from "@/components/auth/feature-settings-sync";
import { adminFeatureForPath, isResidentFeatureEnabled } from "@/lib/resident-features";

function communityFeatureVisible(href?: string) {
  if (!href) return true;
  const key = adminFeatureForPath(href.split("?")[0]);
  return !key || isResidentFeatureEnabled(getUser()?.resident_features, key);
}
import {
  confirmPendingDashboardAction,
  confirmPublishCommunityContent,
  type PendingVerb,
} from "@/lib/admin/dashboard-confirmations";
type MetricCard = {
  label: string;
  value: string;
  hint: string;
  tone: AdminTone;
  href: string;
  icon: ReactNode;
};

function DashboardMetricCard({ label, value, hint, tone, href, icon }: MetricCard) {
  const palette = ADMIN_TONE[tone] ?? ADMIN_TONE.blue;

  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. ${hint}`}
      onClick={(event) => {
        const id = href.split("#")[1];
        if (!id) return;
        const target = document.getElementById(id);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", `#${id}`);
      }}
      className="group flex flex-col rounded-xl border bg-white px-3.5 py-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        borderColor: palette.border,
        boxShadow: NL.shadowCard,
        outlineColor: NL.teal,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold leading-4" style={{ color: NL.textPrimary }}>
          {label}
        </p>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5"
          style={{ background: palette.iconBg, color: palette.iconColor }}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2">
        <p className="text-[1.35rem] font-bold leading-none tabular-nums tracking-tight" style={{ color: NL.textPrimary }}>
          {value}
        </p>
        <p className="mt-1 line-clamp-2 text-[12px] leading-4" style={{ color: NL.textSecondary }}>
          {hint}
        </p>
      </div>
    </Link>
  );
}

function MetricSection({
  title,
  description,
  cards,
}: {
  title: string;
  description: string;
  cards: MetricCard[];
}) {
  if (cards.length === 0) return null;

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-[15px] font-semibold leading-5" style={{ color: NL.textPrimary }}>
          {title}
        </h2>
        <p className="text-[12px] leading-4" style={{ color: NL.textSecondary }}>
          {description}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 min-[520px]:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <DashboardMetricCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );
}

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
  const [featureRevision, setFeatureRevision] = useState(0);
  const cached = getAdminCache<AdminDashboardData>("dashboard:community-stats");
  const [data, setData] = useState<AdminDashboardData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);

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
      const message = apiError(err);
      setError(message);
      if (silent) toastError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (pathname !== "/admin") return;
    void load(Boolean(getAdminCache("dashboard:community-stats")));
  }, [pathname, load]);

  useEffect(() => {
    const sync = () => setFeatureRevision((current) => current + 1);
    window.addEventListener(FEATURES_UPDATED_EVENT, sync);
    return () => window.removeEventListener(FEATURES_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (loading || !data) return;
    if (typeof window === "undefined") return;
    if (window.location.hash.replace(/^#/, "") !== ADMIN_REVIEW_QUEUE_ID) return;
    requestAnimationFrame(() => {
      document.getElementById(ADMIN_REVIEW_QUEUE_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [loading, data]);

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

  const overviewCards = useMemo(() => {
    if (!data) return [];
    const { stats } = data;
    const invitations = stats.invitation_sent_members ?? 0;
    const bookingsOnOwnCard = communityFeatureVisible("/admin/bookings");
    const bookingCount = stats.pending_bookings ?? 0;
    const approvals = bookingsOnOwnCard
      ? Math.max(0, stats.pending_approval_total - bookingCount)
      : stats.pending_approval_total;
    const cards: MetricCard[] = [
      {
        label: "Active Members",
        value: String(stats.total_members),
        hint: stats.total_members > 0 ? "Approved residents" : "No active members yet",
        tone: "blue",
        href: "/admin/members?status=approved",
        icon: dashIcon(UserCheck),
      },
      {
        label: "Pending Invitations",
        value: String(invitations),
        hint: stats.onboarding_members
          ? `${stats.onboarding_members} still completing setup`
          : invitations > 0
            ? "Waiting to join"
            : "No invitations waiting",
        tone: "slate",
        href: "/admin/members?status=invitation_sent",
        icon: dashIcon(UserPlus),
      },
      {
        label: "Pending Approvals",
        value: String(approvals),
        hint: approvals > 0
          ? "Members, content, and other requests"
          : bookingsOnOwnCard && bookingCount > 0
            ? "Pending amenity requests have their own card"
            : "Nothing awaiting review",
        tone: "amber",
        href: `/admin#${ADMIN_REVIEW_QUEUE_ID}`,
        icon: dashIcon(Clock),
      },
      {
        label: "Suspended Members",
        value: String(stats.banned_members),
        hint: stats.banned_members > 0 ? "Restricted from the community" : "No suspended members",
        tone: "red",
        href: "/admin/members?status=banned",
        icon: dashIcon(Ban),
      },
    ];
    return cards.filter((item) => communityFeatureVisible(item.href));
  }, [data, featureRevision]);

  const engagementCards = useMemo(() => {
    if (!data) return [];
    const { stats } = data;
    const posts = stats.approved_posts;
    const notices = stats.published_notices;
    const events = stats.upcoming_events ?? 0;
    const bookings = stats.pending_bookings ?? 0;
    const cards: MetricCard[] = [
      {
        label: "Community Posts",
        value: String(posts),
        hint: posts > 0 ? "Published in the feed" : "No posts in the feed yet",
        tone: "violet",
        href: "/admin/feed",
        icon: dashIcon(MessageSquare),
      },
      {
        label: "Published Notices",
        value: String(notices),
        hint: notices > 0 ? "Live announcements" : "No live announcements",
        tone: "cyan",
        href: "/admin/notices?status=published",
        icon: dashIcon(FileText),
      },
      {
        label: "Upcoming Events",
        value: String(events),
        hint: events > 0 ? "Published and still ahead" : "No upcoming events",
        tone: "teal",
        href: "/admin/events?when=upcoming",
        icon: dashIcon(Calendar),
      },
      {
        label: "Amenity Bookings",
        value: String(bookings),
        hint: bookings > 0 ? "Pending requests" : "No requests waiting",
        tone: "green",
        href: "/admin/bookings?status=pending",
        icon: dashIcon(Building2),
      },
    ];
    return cards.filter((item) => communityFeatureVisible(item.href));
  }, [data, featureRevision]);

  const quickActions = useMemo(
    () => [
      { ...COMMUNITY_QUICK_ACTIONS.invite, onClick: () => setInviteOpen(true) },
      { ...COMMUNITY_QUICK_ACTIONS.notice, href: "/admin/notices", onClick: () => setCreateKind("notice") },
      { ...COMMUNITY_QUICK_ACTIONS.event, href: "/admin/events", onClick: () => setCreateKind("event") },
      { ...COMMUNITY_QUICK_ACTIONS.alert, href: "/admin/alerts", onClick: () => setCreateKind("alert") },
    ].filter((item) => communityFeatureVisible(item.href)),
    [featureRevision],
  );

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
      label: "Units",
      href: "/admin/units",
      desc: "Manage unit billing contacts",
      tone: "slate",
      icon: dashIcon(Users),
    },
    {
      label: "Services",
      href: "/admin/services",
      desc: "Create automatic or optional unit services",
      tone: "blue",
      icon: dashIcon(FileText),
    },
    {
      label: "Service Bills",
      href: "/admin/service-bills",
      desc: "Review unit payment proofs",
      tone: "amber",
      icon: dashIcon(ClipboardList),
    },
    {
      label: "Amenities",
      href: "/admin/amenities",
      desc: "Create facilities with free, per-booking, or monthly billing",
      tone: "cyan",
      icon: dashIcon(Building2),
    },
    {
      label: "Amenity Bills",
      href: "/admin/amenity-bills",
      desc: "Review each resident's monthly amenity proofs",
      tone: "amber",
      icon: dashIcon(ClipboardList),
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
    {
      label: "Billing",
      href: "/admin/billing",
      desc: "Plans, seats, and subscription status",
      tone: "cyan",
      icon: dashIcon(Building2),
    },
  ].filter((link) => !(link.href === "/admin/billing" && getUser()?.access?.billing_exempt))
    .filter((link) => communityFeatureVisible(link.href));

  return (
    <div className="space-y-4">
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

      <div className="space-y-4">
      {error ? (
        <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => load(true)}
            className="self-start rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-red-800"
          >
            Try again
          </button>
        </div>
      ) : null}

      <MetricSection
        title="Community Overview"
        description="Membership and requests for this community."
        cards={overviewCards}
      />
      <MetricSection
        title="Community Engagement"
        description="Posts, notices, events, and amenity requests."
        cards={engagementCards}
      />

      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <DashboardPanel className="h-full lg:col-span-2" title="Member Growth" description="New memberships by month" icon={TrendingUp} tone="violet" tall>
          <DashboardMembersBarChart data={data.member_growth} />
        </DashboardPanel>
        <DashboardPanel className="h-full" title="Membership Status" description="Current member breakdown" icon={Users} tone="green" tall>
          <DashboardMembersPieChart data={data.member_status} />
        </DashboardPanel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3 lg:items-stretch">
        <DashboardPanel
          className="h-full lg:col-span-2"
          title="Community Activity"
          description="Actions in this community over the last 7 days"
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
