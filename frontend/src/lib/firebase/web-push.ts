"use client";

import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { getFirebaseVapidKey, getFirebaseWebConfig, isFirebaseWebConfigured } from "@/lib/firebase/config";
import { registerFcmDevice, unregisterFcmDevice } from "@/lib/api/devices";
import {
  displayForegroundWebPush,
  enrichPushContent,
  resolvePushLink,
  type WebPushMessagePayload,
} from "@/lib/firebase/display-web-push-notification";

const PUSH_PREF_KEY = "nbr_web_push_enabled";
const FCM_TOKEN_KEY = "nbr_fcm_token";
const AUTO_PROMPT_SESSION_KEY = "nbr_web_push_auto_prompted";
const DENIED_BANNER_DISMISSED_KEY = "nbr_web_push_denied_dismissed";

export type WebPushPermission = "unsupported" | "default" | "granted" | "denied";

let messagingPromise: Promise<Messaging | null> | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!isFirebaseWebConfigured()) return null;

  if (!messagingPromise) {
    messagingPromise = (async () => {
      const supported = await isSupported();
      if (!supported) return null;

      const config = getFirebaseWebConfig();
      if (!config) return null;

      const app = getApps().length ? getApps()[0] : initializeApp(config);
      return getMessaging(app);
    })();
  }

  return messagingPromise;
}

export function isWebPushEnabledLocally(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(PUSH_PREF_KEY) === "1";
}

export function getWebPushPermission(): WebPushPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as WebPushPermission;
}

export function isWebPushActive(): boolean {
  if (getWebPushPermission() !== "granted") return false;
  return isWebPushEnabledLocally() || Boolean(getStoredFcmToken());
}

function wasAutoPromptAttemptedThisSession(): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(AUTO_PROMPT_SESSION_KEY) === "1";
}

function markAutoPromptAttempted() {
  sessionStorage.setItem(AUTO_PROMPT_SESSION_KEY, "1");
}

export function isDeniedBannerDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(DENIED_BANNER_DISMISSED_KEY) === "1";
}

export function dismissDeniedBanner() {
  localStorage.setItem(DENIED_BANNER_DISMISSED_KEY, "1");
}

export function notifyWebPushChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("nbr:web-push-changed"));
}

function setWebPushEnabledLocally(enabled: boolean) {
  localStorage.setItem(PUSH_PREF_KEY, enabled ? "1" : "0");
}

function storeFcmToken(token: string | null) {
  if (!token) {
    localStorage.removeItem(FCM_TOKEN_KEY);
    return;
  }
  localStorage.setItem(FCM_TOKEN_KEY, token);
}

function getStoredFcmToken(): string | null {
  return localStorage.getItem(FCM_TOKEN_KEY);
}

export async function enableWebPush(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isFirebaseWebConfigured()) {
    return { ok: false, message: "Firebase web push is not configured. Add NEXT_PUBLIC_FIREBASE_* env vars." };
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, message: "This browser does not support notifications." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notification permission was denied." };
  }

  const messaging = await getMessagingInstance();
  const vapidKey = getFirebaseVapidKey();
  if (!messaging || !vapidKey) {
    return { ok: false, message: "Firebase messaging is unavailable in this browser." };
  }

  try {
    const swResponse = await fetch("/firebase-messaging-sw.js", { method: "HEAD", cache: "no-store" });
    if (!swResponse.ok) {
      return {
        ok: false,
        message:
          "Firebase service worker is missing. In the frontend folder run: npm run firebase:sw (requires NEXT_PUBLIC_FIREBASE_* in .env.local).",
      };
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) {
      return { ok: false, message: "Could not get an FCM token." };
    }

    await registerFcmDevice(token);
    storeFcmToken(token);
    setWebPushEnabledLocally(true);
    notifyWebPushChanged();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not enable web push.";
    return { ok: false, message };
  }
}

export async function disableWebPush(): Promise<void> {
  const token = getStoredFcmToken();
  try {
    await unregisterFcmDevice(token ?? undefined);
  } catch {
    // best effort
  }
  storeFcmToken(null);
  setWebPushEnabledLocally(false);
  notifyWebPushChanged();
}

export async function syncWebPushIfEnabled(): Promise<void> {
  if (getWebPushPermission() === "granted") {
    await enableWebPush();
    return;
  }

  if (!isWebPushEnabledLocally()) return;
  await enableWebPush();
}

/** Silently refresh token when permission is already granted. */
export async function ensureWebPushRegistered(): Promise<
  { ok: true } | { ok: false; reason: "unsupported" | "denied" | "error"; message?: string }
> {
  if (!isFirebaseWebConfigured()) {
    return { ok: false, reason: "unsupported", message: "Firebase web push is not configured." };
  }

  const permission = getWebPushPermission();
  if (permission === "unsupported") {
    return { ok: false, reason: "unsupported", message: "This browser does not support notifications." };
  }

  if (permission === "denied") {
    return { ok: false, reason: "denied", message: "Notification permission was denied." };
  }

  const result = await enableWebPush();
  if (!result.ok) {
    return { ok: false, reason: "error", message: result.message };
  }

  return { ok: true };
}

/**
 * Request notification permission once per session when the admin opens the dashboard.
 * Browsers require a user gesture for some cases, but a short post-load prompt is standard.
 */
export async function autoEnrollWebPushOnDashboard(): Promise<
  { ok: true } | { ok: false; reason: "unsupported" | "denied" | "skipped" | "error"; message?: string }
> {
  if (!isFirebaseWebConfigured()) {
    return { ok: false, reason: "skipped" };
  }

  const permission = getWebPushPermission();

  if (permission === "granted") {
    return ensureWebPushRegistered();
  }

  if (permission === "denied") {
    return { ok: false, reason: "denied", message: "Notification permission was denied." };
  }

  if (permission === "unsupported") {
    return { ok: false, reason: "unsupported" };
  }

  if (wasAutoPromptAttemptedThisSession()) {
    return { ok: false, reason: "skipped" };
  }

  markAutoPromptAttempted();
  return ensureWebPushRegistered();
}

export type { WebPushMessagePayload } from "@/lib/firebase/display-web-push-notification";

function parseIncomingPushPayload(payload: {
  notification?: { title?: string; body?: string };
  data?: Record<string, string | undefined>;
  fcmOptions?: { link?: string };
}): WebPushMessagePayload {
  const data = payload.data ?? {};
  const kind = data.kind;
  const postId = data.post_id;
  const tag = kind && postId ? `${kind}-${postId}` : kind ? String(kind) : null;
  const content = enrichPushContent({
    title: payload.notification?.title ?? data.title ?? data.push_title,
    body: payload.notification?.body ?? data.body ?? data.push_body,
    kind,
    actor_name: data.actor_name,
    actorName: data.actorName,
  });
  const rawLink = data.action_url ?? data.actionUrl ?? data.link ?? payload.fcmOptions?.link ?? null;
  const hints = {
    category: data.category ?? data.notice_category ?? null,
    title: content.title,
    body: content.body,
  };

  return {
    title: content.title,
    body: content.body,
    link: rawLink ? resolvePushLink(rawLink, hints) : null,
    tag,
    category: hints.category,
  };
}

export async function subscribeForegroundMessages(
  onInApp?: (payload: WebPushMessagePayload) => void,
) {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    const message = parseIncomingPushPayload(payload);
    void displayForegroundWebPush(message, onInApp);
  });
}
