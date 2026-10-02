"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, X } from "lucide-react";
import type { WebPushMessagePayload } from "@/lib/firebase/display-web-push-notification";
import { resolvePushLink } from "@/lib/firebase/display-web-push-notification";
import { subscribeForegroundMessages } from "@/lib/firebase/web-push";
import { subscribeForegroundNotification } from "@/lib/notifications/foreground-notification-events";
import { notificationPreviewText } from "@/lib/notifications/notification-preview";

const MAX_ITEMS = 20;

type ForegroundNotificationItem = WebPushMessagePayload & { id: string };

function buildItemId(payload: WebPushMessagePayload) {
  return payload.tag ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    setItems((current) => {
      const withoutDuplicate = payload.tag
        ? current.filter((item) => item.tag !== payload.tag)
        : current;
      return [{ ...payload, id }, ...withoutDuplicate].slice(0, MAX_ITEMS);
    });
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;

    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== "NBR_PUSH_NAVIGATE") return;
      const href = event.data.href;
      if (typeof href === "string" && href.trim()) {
        router.push(href);
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
                <li key={item.id} className="border-b border-slate-100 last:border-b-0">
                  <div className="flex items-start gap-2 px-3 py-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openItem(item)}
                    >
                      <span className="block truncate text-sm font-semibold text-slate-900">{item.title}</span>
                      {item.body ? (
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-600 line-clamp-3">
                          {notificationPreviewText(item.body)}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Dismiss notification"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
