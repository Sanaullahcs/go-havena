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
  emitNotificationsRefresh,
  fetchNotifications,
  markAllRead,
  markNotificationRead,
  NOTIFICATIONS_REFRESH_EVENT,
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
  type NotificationFeedModule,
} from "@/lib/notifications/notification-feed-module";

function notificationKind(row: Record<string, unknown>): string {
  const raw = row.data;
  if (!raw) return "";
  if (typeof raw === "object") return String((raw as { kind?: unknown }).kind ?? "");
  if (typeof raw !== "string") return "";
  try {
    return String((JSON.parse(raw) as { kind?: unknown }).kind ?? "");
  } catch {
    return "";
  }
}

function isMessageNotification(row: Record<string, unknown>): boolean {
  const type = String(row.type ?? "");
  const kind = notificationKind(row);
  const actionUrl = String(row.action_url ?? "");
  return (
    type === "message" ||
    kind === "message" ||
    kind === "new_message" ||
    actionUrl.includes("/screens/messages/chat") ||
    actionUrl.includes("/admin/messages")
  );
}

function dbRowToNote(row: Record<string, unknown>): AppNotification {
  const storedType = (row.type as AppNotification["type"]) ?? "info";
  return {
    id: row.id as number,
    type: isMessageNotification(row) ? "message" : storedType,
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
  const initialLoadDone = useRef(false);
  const requestRef = useRef(0);

  const load = useCallback(async (options?: { initial?: boolean; silent?: boolean }) => {
    const requestId = ++requestRef.current;
    if (options?.silent) {
      /* keep the current list visible */
    } else if (options?.initial) setLoading(true);
    else setPageLoading(true);
    if (!options?.silent) setError(null);
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
      if (requestId !== requestRef.current) return;
      const rows = (data?.data ?? []) as Record<string, unknown>[];
      setNotes(rows.map(dbRowToNote));
      setMeta(data.meta ?? null);
      setUnread(data.unread ?? 0);
    } catch (err) {
      if (!options?.silent) {
        setNotes([]);
        setMeta(null);
        setUnread(0);
        if (options?.initial) setError(apiError(err));
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
        setPageLoading(false);
      }
    }
  }, [filter, page]);

  useEffect(() => {
    load({ initial: !initialLoadDone.current });
    initialLoadDone.current = true;
  }, [filter, page, load]);

  useEffect(() => {
    const onSession = () => {
      setNotes([]);
      setMeta(null);
      setUnread(0);
      void load({ initial: true });
    };
    const onNotifications = () => {
      void load({ silent: true });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    window.addEventListener("nbr-session-updated", onSession);
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onNotifications);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load({ silent: true });
    }, 20_000);
    return () => {
      window.removeEventListener("nbr-session-updated", onSession);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onNotifications);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [load]);

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
    setUnread((count) => Math.max(0, count - 1));
    try {
      await markNotificationRead(id);
      emitNotificationsRefresh();
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
      emitNotificationsRefresh();
      toastSuccess("All notifications marked as read");
      await load();
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
