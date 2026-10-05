"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Info,
  Loader2,
  MessageSquare,
  Settings2,
  Shield,
} from "lucide-react";
import { DashboardEmptyState, DashboardHero, LiveBadge } from "@/components/admin/dashboard/dashboard-shared";
import { DashboardPanel } from "@/components/admin/dashboard/dashboard-panel";
import { AdminBadge, DtPagination, StatTile } from "@/components/admin/ui";
import { dashIcon } from "@/components/admin/dashboard/dashboard-icons";
import {
  fetchNotifications,
  markAllRead,
  markNotificationRead,
  type NotificationListMeta,
} from "@/lib/api/notifications";
import { apiError } from "@/lib/api/client";
import { PageError } from "@/components/shared/page-states";
import { TableLoadingOverlay } from "@/components/shared/loaders";
import { toastError, toastInfo, toastSuccess } from "@/lib/alert";
import { confirmMarkAllNotificationsRead } from "@/lib/admin/dashboard-confirmations";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { adminTableBusy } from "@/lib/admin/table-loading";
import { NL } from "@/lib/design-tokens";
import type { AppNotification } from "@/components/shared/notification-bell";
import { resolveAdminNotificationHref } from "@/lib/notifications/resolve-admin-notification-href";
import { notificationPreviewText } from "@/lib/notifications/notification-preview";
import {
  countNotificationsByModule,
  filterNotificationsByModule,
  type NotificationFeedModule,
} from "@/lib/notifications/notification-feed-module";

const FALLBACK: AppNotification[] = [
  {
    id: 1,
    type: "warning",
    title: "New moderation report",
    body: "A resident filed a noise complaint that needs review.",
    time: "2m ago",
    read: false,
    actionUrl: "/admin/moderation",
  },
  {
    id: 2,
    type: "success",
    title: "Membership approved",
    body: "A membership request was approved successfully.",
    time: "15m ago",
    read: false,
    actionUrl: "/admin/members",
  },
  {
    id: 3,
    type: "message",
    title: "New message",
    body: "You have a new resident message waiting in your inbox.",
    time: "1h ago",
    read: false,
  },
  {
    id: 4,
    type: "info",
    title: "Marketplace listing posted",
    body: "A new marketplace item was submitted for review.",
    time: "2h ago",
    read: true,
    actionUrl: "/admin/marketplace",
  },
  {
    id: 5,
    type: "system",
    title: "System update",
    body: "Havena platform services are running normally.",
    time: "Yesterday",
    read: true,
  },
];

function dbRowToNote(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as number,
    type: (row.type as AppNotification["type"]) ?? "info",
    title: row.title as string,
    body: row.body as string | undefined,
    time: (row.created_at as string) ?? (row.time as string) ?? "",
    read: !!row.read_at || !!row.read,
    actionUrl: row.action_url as string | undefined,
    noticeCategory: (row.notice_category as string | undefined) ?? null,
  };
}

const MODULE_FILTERS: NotificationFeedModule[] = ["events", "notices", "amenities", "others"];

type Filter = "all" | "unread" | AppNotification["type"] | NotificationFeedModule;

function isModuleFilter(filter: Filter): filter is NotificationFeedModule {
  return MODULE_FILTERS.includes(filter as NotificationFeedModule);
}

function typeMeta(type: AppNotification["type"]) {
  switch (type) {
    case "success":
      return { color: NL.success, bg: "#ECFDF5", Icon: CheckCheck, label: "Success" };
    case "warning":
      return { color: NL.warning, bg: "#FFFBEB", Icon: AlertTriangle, label: "Warning" };
    case "message":
      return { color: "#7C3AED", bg: "#F5F3FF", Icon: MessageSquare, label: "Message" };
    case "system":
      return { color: "#64748B", bg: "#F1F5F9", Icon: Shield, label: "System" };
    default:
      return { color: NL.brandPrimary, bg: NL.chipBg, Icon: Info, label: "Info" };
  }
}

function filterNotes(notes: AppNotification[], filter: Filter): AppNotification[] {
  if (filter === "all") return notes;
  if (filter === "unread") return notes.filter((n) => !n.read);
  if (isModuleFilter(filter)) return filterNotificationsByModule(notes, filter);
  return notes.filter((n) => n.type === filter);
}

function paginateNotes(notes: AppNotification[], page: number): AppNotification[] {
  const start = (page - 1) * ADMIN_TABLE_PAGE_SIZE;
  return notes.slice(start, start + ADMIN_TABLE_PAGE_SIZE);
}

function fallbackMeta(notes: AppNotification[]): NotificationListMeta {
  return {
    total: notes.length,
    last_page: Math.max(1, Math.ceil(notes.length / ADMIN_TABLE_PAGE_SIZE)),
    per_page: ADMIN_TABLE_PAGE_SIZE,
    current_page: 1,
    total_all: notes.length,
    warning: notes.filter((n) => n.type === "warning").length,
    message: notes.filter((n) => n.type === "message").length,
  };
}

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [meta, setMeta] = useState<NotificationListMeta | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [marking, setMarking] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const initialLoadDone = useRef(false);

  const load = useCallback(async (options?: { initial?: boolean }) => {
    if (options?.initial) setLoading(true);
    else setPageLoading(true);
    setError(null);
    try {
      const params: {
        page: number;
        unread_only?: boolean;
        type?: string;
        module?: string;
      } = { page };

      if (filter === "unread") params.unread_only = true;
      else if (isModuleFilter(filter)) params.module = filter;
      else if (filter !== "all") params.type = filter;

      const data = await fetchNotifications(params);
      const rows = (data?.data ?? []) as Record<string, unknown>[];

      if (data.meta) {
        setNotes(rows.map(dbRowToNote));
        setMeta(data.meta);
        setUnread(data.unread ?? 0);
        setUsingFallback(false);
      } else if (rows.length) {
        setNotes(rows.map(dbRowToNote));
        setMeta(null);
        setUnread(data.unread ?? 0);
        setUsingFallback(false);
      } else {
        throw new Error("No notification data");
      }
    } catch (err) {
      const filtered = filterNotes(FALLBACK, filter);
      setNotes(paginateNotes(filtered, page));
      setMeta({
        ...fallbackMeta(filtered),
        current_page: page,
        last_page: Math.max(1, Math.ceil(filtered.length / ADMIN_TABLE_PAGE_SIZE)),
      });
      setUnread(FALLBACK.filter((n) => !n.read).length);
      setUsingFallback(true);
      if (options?.initial) setError(apiError(err));
    } finally {
      setLoading(false);
      setPageLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    load({ initial: !initialLoadDone.current });
    initialLoadDone.current = true;
  }, [filter, page, load]);

  const handleFilterChange = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  const totalAll = meta?.total_all ?? notes.length;
  const warningCount = meta?.warning ?? notes.filter((n) => n.type === "warning").length;
  const messageCount = meta?.message ?? notes.filter((n) => n.type === "message").length;
  const systemCount = meta?.system ?? notes.filter((n) => n.type === "system").length;
  const moduleCounts = useMemo(() => {
    if (meta?.events != null || meta?.notices != null || meta?.amenities != null || meta?.others != null) {
      return {
        events: meta?.events ?? 0,
        notices: meta?.notices ?? 0,
        amenities: meta?.amenities ?? 0,
        others: meta?.others ?? 0,
      };
    }
    return countNotificationsByModule(notes);
  }, [meta?.amenities, meta?.events, meta?.notices, meta?.others, notes]);
  const lastPage = meta?.last_page ?? 1;
  const filteredTotal = meta?.total ?? notes.length;
  const listBusy = adminTableBusy(pageLoading, marking);

  const markOne = async (id: number) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (!usingFallback) setUnread((count) => Math.max(0, count - 1));
    try {
      await markNotificationRead(id);
    } catch {
      /* keep optimistic UI */
    }
  };

  const openNotification = async (note: AppNotification) => {
    await markOne(note.id);
    const href = resolveAdminNotificationHref(note.actionUrl, note.type, {
      title: note.title,
      body: note.body,
      category: note.noticeCategory,
    });
    if (href) {
      router.push(href);
      return;
    }
    toastInfo("This notification has no related page to open.");
  };

  const markAll = async () => {
    if (unread === 0) return;
    const result = await confirmMarkAllNotificationsRead(unread);
    if (!result.isConfirmed) return;

    setMarking(true);
    setNotes((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await markAllRead();
      toastSuccess("All notifications marked as read");
      if (!usingFallback) await load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: NL.brandPrimary }} />
      </div>
    );
  }

  if (error && notes.length === 0) {
    return <PageError message={error} onRetry={() => load({ initial: true })} />;
  }

  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: totalAll },
    { key: "unread", label: "Unread", count: unread },
    { key: "warning", label: "Alerts", count: warningCount },
    { key: "message", label: "Messages", count: messageCount },
    { key: "events", label: "Events", count: moduleCounts.events ?? 0 },
    { key: "notices", label: "Notices", count: moduleCounts.notices ?? 0 },
    { key: "amenities", label: "Amenities", count: moduleCounts.amenities ?? 0 },
    { key: "others", label: "Others", count: moduleCounts.others ?? 0 },
    { key: "system", label: "System", count: systemCount },
  ];

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Inbox"
        title="Notifications"
        description="Stay on top of moderation, memberships, and system events across your communities."
        variant="system"
        badges={
          <>
            <LiveBadge />
            {unread > 0 ? <AdminBadge tone="amber">{unread} unread</AdminBadge> : <AdminBadge tone="green">All caught up</AdminBadge>}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total" value={String(totalAll)} hint="All notifications" tone="blue" icon={dashIcon(Bell)} />
        <StatTile label="Unread" value={String(unread)} hint="Needs attention" tone="amber" icon={dashIcon(AlertTriangle)} />
        <StatTile label="Alerts" value={String(warningCount)} hint="Moderation & warnings" tone="red" icon={dashIcon(Shield)} />
        <StatTile label="Messages" value={String(messageCount)} hint="Resident messages" tone="violet" icon={dashIcon(MessageSquare)} />
      </div>

      <DashboardPanel
        title="Activity feed"
        description="Click a notification to open it and mark it as read"
        icon={Bell}
        tone="blue"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/profile"
              className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-[12px] font-semibold transition hover:shadow-sm"
              style={{ borderColor: NL.borderCard, color: NL.textBody }}
            >
              <Settings2 className="h-3.5 w-3.5" strokeWidth={2} />
              Preferences
            </Link>
            {unread > 0 ? (
              <button
                type="button"
                disabled={marking}
                onClick={markAll}
                className="nl-btn-primary !py-1.5 !text-[12px] inline-flex items-center gap-1.5"
              >
                <CheckCheck className="h-3.5 w-3.5" strokeWidth={2} />
                {marking ? "Updating…" : "Mark all read"}
              </button>
            ) : null}
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => handleFilterChange(f.key)}
                className="rounded-full border px-3 py-1.5 text-[12px] font-semibold transition"
                style={{
                  borderColor: active ? "rgba(0,124,250,0.35)" : NL.borderCard,
                  background: active ? NL.chipBg : "#fff",
                  color: active ? NL.brandPrimaryDeep : NL.textSecondary,
                }}
              >
                {f.label}
                {typeof f.count === "number" ? (
                  <span className="ml-1.5 tabular-nums opacity-70">{f.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {notes.length === 0 ? (
          listBusy ? (
            <div className="relative min-h-[12rem]">
              <TableLoadingOverlay />
            </div>
          ) : (
          <DashboardEmptyState
            title="No notifications here"
            description="Try another filter, or check back when new activity arrives."
            icon={<Bell className="h-5 w-5" strokeWidth={2} />}
          />
          )
        ) : (
          <div className="relative" aria-busy={listBusy || undefined}>
            {listBusy ? <TableLoadingOverlay /> : null}
            <div className={listBusy ? "pointer-events-none select-none opacity-45 transition-opacity duration-200" : "transition-opacity duration-200"}>
            <div className="space-y-2">
              {notes.map((n) => {
                const metaType = typeMeta(n.type);
                const Icon = metaType.Icon;
                const href = resolveAdminNotificationHref(n.actionUrl, n.type, {
                  title: n.title,
                  body: n.body,
                  category: n.noticeCategory,
                });
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openNotification(n)}
                    className="flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition hover:shadow-sm"
                    style={{
                      borderColor: n.read ? NL.borderCard : "rgba(0,124,250,0.28)",
                      background: n.read ? "#fff" : "#FFFFFF",
                    }}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: metaType.bg, color: metaType.color }}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13.5px] font-bold" style={{ color: NL.textPrimary }}>
                          {n.title}
                        </p>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={{ background: metaType.bg, color: metaType.color }}
                        >
                          {metaType.label}
                        </span>
                        {!n.read ? (
                          <span className="h-2 w-2 rounded-full" style={{ background: NL.brandPrimary }} aria-label="Unread" />
                        ) : null}
                      </div>
                      {n.body ? (
                        <p
                          className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed"
                          style={{ color: NL.textSecondary }}
                        >
                          {notificationPreviewText(n.body)}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className="text-[11px]" style={{ color: NL.textMuted }}>
                          {n.time}
                        </span>
                        {href ? (
                          <span
                            className="text-[11.5px] font-bold"
                            style={{ color: NL.link }}
                          >
                            Open →
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {lastPage > 1 ? (
              <DtPagination
                showing={notes.length}
                total={filteredTotal}
                page={page}
                lastPage={lastPage}
                onPageChange={setPage}
                pageSize={ADMIN_TABLE_PAGE_SIZE}
              />
            ) : null}
            </div>
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}
