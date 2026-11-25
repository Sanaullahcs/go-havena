"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, X } from "lucide-react";
import type { WebPushMessagePayload } from "@/lib/firebase/display-web-push-notification";
import { resolvePushLink } from "@/lib/firebase/display-web-push-notification";
import { handleServiceWorkerForegroundMessage, subscribeForegroundMessages } from "@/lib/firebase/web-push";
import { subscribeForegroundNotification } from "@/lib/notifications/foreground-notification-events";
import { notificationPreviewText } from "@/lib/notifications/notification-preview";

const MAX_ITEMS = 20;
const DISMISS_MS = 3500;
const FADE_MS = 320;

type ForegroundNotificationItem = WebPushMessagePayload & { id: string; arrivedAt: number };

function buildItemId(payload: WebPushMessagePayload) {
  return payload.tag ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function NotificationPopupRow({
  item,
  onDismiss,
  onOpen,
}: {
  item: ForegroundNotificationItem;
  onDismiss: (id: string) => void;
  onOpen: (item: ForegroundNotificationItem) => void;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = window.setTimeout(() => onDismiss(item.id), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, item.id, onDismiss]);

  return (
    <li
      className={`overflow-hidden border-b border-slate-100 transition-[opacity,transform,max-height,margin] duration-300 ease-out last:border-b-0 ${
        leaving ? "pointer-events-none max-h-0 -translate-y-1 opacity-0" : "max-h-40 translate-y-0 opacity-100"
      }`}
    >
      <div className="flex items-start gap-2 px-3 py-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item)}>
          <span className="block truncate text-sm font-semibold text-slate-900">{item.title}</span>
          {item.body ? (
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-600 line-clamp-3">
              {notificationPreviewText(item.body)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setLeaving(true)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function ForegroundNotificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<ForegroundNotificationItem[]>([]);

  const removeItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const openItem = useCallback(
    (item: ForegroundNotificationItem) => {
      removeItem(item.id);
      if (item.link) {
        router.push(
          resolvePushLink(item.link, {
            category: item.category,
            title: item.title,
            body: item.body,
          }),
        );
      }
    },
    [removeItem, router],
  );

  const addItem = useCallback((payload: WebPushMessagePayload) => {
    const id = buildItemId(payload);
    const arrivedAt = Date.now();
    setItems((current) => {
      const withoutDuplicate = payload.tag
        ? current.filter((item) => item.tag !== payload.tag)
        : current;
      return [{ ...payload, id, arrivedAt }, ...withoutDuplicate].slice(0, MAX_ITEMS);
    });
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;

    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "NBR_PUSH_NAVIGATE") {
        const href = event.data.href;
        if (typeof href === "string" && href.trim()) {
          router.push(href);
        }
        return;
      }

      if (event.data?.type === "NBR_PUSH_FOREGROUND") {
        handleServiceWorkerForegroundMessage({
          title: typeof event.data.title === "string" ? event.data.title : "",
          body: typeof event.data.body === "string" ? event.data.body : "",
          link: typeof event.data.link === "string" ? event.data.link : null,
          tag: typeof event.data.tag === "string" ? event.data.tag : null,
          category: typeof event.data.category === "string" ? event.data.category : null,
          communityId: event.data.communityId != null ? String(event.data.communityId) : null,
          scope: typeof event.data.scope === "string" ? event.data.scope : null,
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
  }, [router]);

  useEffect(() => {
    const unsubscribeBanner = subscribeForegroundNotification(addItem);
    let unsubscribeFcm = () => {};

    void (async () => {
      unsubscribeFcm = await subscribeForegroundMessages();
    })();

    return () => {
      unsubscribeBanner();
      unsubscribeFcm();
    };
  }, [addItem]);

  return (
    <>
      {children}
      {items.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-end px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="pointer-events-auto flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-sky-600" strokeWidth={2.25} aria-hidden />
                <span className="text-sm font-semibold text-slate-900">Notifications</span>
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                  {items.length}
                </span>
              </div>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
              >
                Clear all
              </button>
            </div>
            <ul className="max-h-[min(420px,70vh)] overflow-y-auto">
              {items.map((item) => (
                <NotificationPopupRow
                  key={`${item.id}-${item.arrivedAt}`}
                  item={item}
                  onDismiss={removeItem}
                  onOpen={openItem}
                />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
