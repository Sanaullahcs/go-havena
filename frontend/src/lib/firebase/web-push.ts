"use client";

import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type Messaging } from "firebase/messaging";
import { getUser, getManagedCommunityId, isCommunityAdminUser } from "@/lib/auth/session";
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function firebaseErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") {
    return err.code;
  }
  return "";
}

/** Chrome can report offline on localhost while Google is still reachable. Firebase refuses getToken in that state. */
function forceNavigatorOnline(): () => void {
  try {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
  } catch {
    return () => {};
  }

  return () => {
    Reflect.deleteProperty(navigator, "onLine");
  };
}

async function browserCanReachFirebase(): Promise<boolean> {
  try {
    await fetch("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js", {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
    });
    return true;
  } catch {
    return false;
  }
}

async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  await navigator.serviceWorker.ready;

  const worker = registration.active ?? registration.installing ?? registration.waiting;
  if (!worker || worker.state === "activated") {
    return registration.active ? await navigator.serviceWorker.ready : registration;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Firebase service worker did not activate."));
    }, 10000);
    const finish = () => {
      if (worker.state === "activated") {
        window.clearTimeout(timer);
        resolve();
        return;
      }
      if (worker.state === "redundant") {
        window.clearTimeout(timer);
        reject(new Error("Firebase service worker failed to activate."));
      }
    };
    finish();
    worker.addEventListener("statechange", finish);
  });

  return navigator.serviceWorker.ready;
}

async function requestFcmToken(
  messaging: Messaging,
  vapidKey: string,
  registration: ServiceWorkerRegistration,
): Promise<string> {
  const reachable = await browserCanReachFirebase();
  if (!navigator.onLine && !reachable) {
    throw new Error("Chrome is offline, so a desktop push token cannot be registered.");
  }

  const readToken = async (forceOnline: boolean) => {
    const restore = forceOnline ? forceNavigatorOnline() : () => {};
    try {
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
      if (!token) {
        throw new Error("Could not get an FCM token.");
      }
      return token;
    } finally {
      restore();
    }
  };

  try {
    return await readToken(!navigator.onLine);
  } catch (err) {
    const code = firebaseErrorCode(err);
    const retryable =
      code.includes("app-offline") ||
      code.includes("failed-service-worker-registration") ||
      code.includes("token-subscribe-failed");
    if (!retryable || !reachable) {
      throw err;
    }
    await delay(1000);
    return readToken(true);
  }
}

export async function enableWebPush(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isFirebaseWebConfigured()) {
    return { ok: false, message: "Firebase web push is not configured. Add NEXT_PUBLIC_FIREBASE_* env vars." };
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, message: "This browser does not support notifications." };
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
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

    const registration = await registerMessagingServiceWorker();
    const token = await requestFcmToken(messaging, vapidKey, registration);

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
    communityId: data.community_id ?? null,
    scope: data.scope ?? null,
  };
}

function isAuthorizedCommunityAdminPush(message: WebPushMessagePayload): boolean {
  const user = getUser();
  if (!user || !isCommunityAdminUser(user)) return true;
  if (user.active_context === "resident" || user.active_mode === "resident") return true;
  if (message.scope === "account") return true;

  const incoming = message.communityId ? Number(message.communityId) : null;
  if (!incoming) return true;
  if (user.status === "suspended" || user.community_admin_status !== "approved") return false;

  const allowed = getManagedCommunityId(user);
  return allowed != null && Number(allowed) === incoming;
}

export async function subscribeForegroundMessages(
  onInApp?: (payload: WebPushMessagePayload) => void,
) {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    const message = parseIncomingPushPayload(payload);
    if (!isAuthorizedCommunityAdminPush(message)) return;
    void displayForegroundWebPush(message, onInApp);
  });
}

export function handleServiceWorkerForegroundMessage(data: {
  title?: string;
  body?: string;
  link?: string | null;
  tag?: string | null;
  category?: string | null;
  communityId?: string | null;
  scope?: string | null;
}) {
  const message: WebPushMessagePayload = {
    title: data.title?.trim() || "Havena",
    body: data.body?.trim() || "",
    link: data.link ?? null,
    tag: data.tag ?? null,
    category: data.category ?? null,
    communityId: data.communityId ?? null,
    scope: data.scope ?? null,
  };
  if (!isAuthorizedCommunityAdminPush(message)) return;
  void displayForegroundWebPush(message);
}
