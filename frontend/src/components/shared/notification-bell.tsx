"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Info,
  MessageSquare,
  Settings,
} from "lucide-react";
import {
  emitNotificationsRefresh,
  fetchNotifications,
  markNotificationRead,
  markAllRead,
  NOTIFICATIONS_REFRESH_EVENT,
} from "@/lib/api/notifications";
import { confirmMarkAllNotificationsRead } from "@/lib/admin/dashboard-confirmations";
import { resolveAdminNotificationHref } from "@/lib/notifications/resolve-admin-notification-href";
import { notificationPreviewText } from "@/lib/notifications/notification-preview";
import { subscribeForegroundNotification } from "@/lib/notifications/foreground-notification-events";
import { NL } from "@/lib/design-tokens";

export type AppNotification = {
  id: number;
  type: "info" | "success" | "warning" | "message" | "system";
  title: string;
  body?: string;
  time: string;
  read: boolean;
  actionUrl?: string;
  noticeCategory?: string | null;
};

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

function typeColor(type: AppNotification["type"]): string {
  switch (type) {
    case "success":
      return NL.success;
    case "warning":
      return NL.warning;
    case "message":
      return "#7C3AED";
    case "system":
      return "#64748B";
    default:
      return NL.brandPrimary;
  }
}

function TypeIcon({ type }: { type: AppNotification["type"] }) {
  const cls = "h-4 w-4";
  switch (type) {
    case "success":
      return <CheckCheck className={cls} strokeWidth={2} />;
    case "warning":
      return <AlertTriangle className={cls} strokeWidth={2} />;
    case "message":
      return <MessageSquare className={cls} strokeWidth={2} />;
    case "system":
      return <Settings className={cls} strokeWidth={2} />;
    default:
      return <Info className={cls} strokeWidth={2} />;
  }
}

export function NotificationBell({
  notifications: init,
  accentColor = NL.brandPrimary,
  viewAllHref,
  resolveHref = resolveAdminNotificationHref,
}: {
  notifications?: AppNotification[];
  accentColor?: string;
  viewAllHref?: string;
  resolveHref?: (
    actionUrl?: string | null,
    type?: AppNotification["type"],
    hints?: { title?: string; body?: string; category?: string | null },
  ) => string | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<AppNotification[]>(init ?? []);
  const [unreadCount, setUnreadCount] = useState(() => (init ?? []).filter((note) => !note.read).length);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const queuedRef = useRef(false);

  const unread = unreadCount;
  const keepSeedWhenEmpty = (init?.length ?? 0) > 0;

  const load = useCallback(() => {
    if (loadingRef.current) {
      queuedRef.current = true;
      return;
    }
    loadingRef.current = true;
    fetchNotifications()
      .then((data) => {
        const rows = data?.data;
        if (!Array.isArray(rows)) return;
        if (rows.length > 0 || !keepSeedWhenEmpty) {
          setNotes(rows.map(dbRowToNote));
        }
        if (typeof data?.unread === "number") setUnreadCount(data.unread);
      })
      .catch(() => {
        /* keep the last authorized list, or the resident seed when the request fails */
      })
      .finally(() => {
        loadingRef.current = false;
        if (queuedRef.current) {
          queuedRef.current = false;
          load();
        }
      });
  }, [keepSeedWhenEmpty]);

  useEffect(() => {
    load();
    const onSession = () => {
      if (!keepSeedWhenEmpty) setNotes([]);
      load();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("nbr-session-updated", onSession);
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, load);
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribePush = subscribeForegroundNotification(() => load());
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 20_000);

    return () => {
      window.removeEventListener("nbr-session-updated", onSession);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, load);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribePush();
      window.clearInterval(timer);
    };
  }, [keepSeedWhenEmpty, load]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markOne = (id: number) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
    markNotificationRead(id)
      .then(() => emitNotificationsRefresh())
      .catch(() => {});
  };

  const openNotification = (note: AppNotification) => {
    markOne(note.id);
    setOpen(false);
    const href = resolveHref(note.actionUrl, note.type, {
      title: note.title,
      body: note.body,
      category: note.noticeCategory,
    });
    if (href) {
      router.push(href);
      return;
    }
  };

  const markAll = async () => {
    const unreadCount = notes.filter((n) => !n.read).length;
    if (unreadCount === 0) return;
    const result = await confirmMarkAllNotificationsRead(unreadCount);
    if (!result.isConfirmed) return;
    setNotes((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    markAllRead()
      .then(() => emitNotificationsRefresh())
      .catch(() => {});
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition hover:bg-slate-50"
        style={{ borderColor: NL.borderCard, color: NL.textSecondary }}
      >
        <Bell className="h-4 w-4" strokeWidth={2} />
        {unread > 0 ? (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 text-[10px] font-bold leading-none text-white"
            style={{ background: accentColor }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-1.25rem))] overflow-hidden rounded-2xl border bg-white shadow-2xl"
          style={{
            borderColor: NL.borderCard,
            boxShadow: "0 20px 50px rgba(15, 23, 42, 0.14)",
            animation: "nl-swal-in 0.18s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: NL.borderCard }}>
            <div className="flex items-center gap-2">
              <h3 className="text-[13.5px] font-bold" style={{ color: NL.textPrimary }}>
                Notifications
              </h3>
              {unread > 0 ? (
                <span className="rounded-full px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: accentColor }}>
                  {unread}
                </span>
              ) : null}
            </div>
            {unread > 0 ? (
              <button type="button" onClick={markAll} className="text-[11.5px] font-semibold transition hover:opacity-70" style={{ color: accentColor }}>
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {notes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full"
                  style={{ background: NL.chipBg, color: NL.brandPrimary }}
                >
                  <Bell className="h-5 w-5" strokeWidth={2} />
                </span>
                <p className="text-[12.5px]" style={{ color: NL.textMuted }}>
                  You&apos;re all caught up!
                </p>
              </div>
            ) : (
              notes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n)}
                  className="group flex w-full items-start gap-3 border-b px-4 py-3 text-left transition hover:bg-slate-50"
                  style={{
                    borderColor: "rgba(237,237,237,0.9)",
                    background: n.read ? undefined : "rgba(239,246,255,0.55)",
                  }}
                >
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ background: typeColor(n.type) }}
                  >
                    <TypeIcon type={n.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold leading-snug" style={{ color: NL.textPrimary }}>
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-3 text-[11.5px]" style={{ color: NL.textSecondary }}>
                        {notificationPreviewText(n.body)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10.5px]" style={{ color: NL.textMuted }}>
                      {n.time}
                    </p>
                  </div>
                  {!n.read ? <div className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: accentColor }} /> : null}
                </button>
              ))
            )}
          </div>

          {viewAllHref ? (
            <div className="border-t px-4 py-2.5" style={{ borderColor: NL.borderCard }}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(viewAllHref);
                }}
                className="block w-full rounded-lg py-1.5 text-center text-[12.5px] font-semibold transition hover:bg-slate-50"
                style={{ color: accentColor }}
              >
                View all notifications →
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
