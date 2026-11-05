import i18n from "../i18n";
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { isExpoGo } from "../utils/expo-runtime";
import * as Device from "expo-device";
import { AppState, Linking, Platform } from "react-native";
import { fetchAccountPushPreference, registerDevice, unregisterDevice } from "./devices-api";
import { getNoticeDetailRoute } from "./notices-api";
import { resolveNotificationRoute } from "./notifications-api";
import { getNativePlatform } from "./app-version";
import { emitNotificationBanner } from "./notification-events";
import {
  getPushNotificationsEnabled,
  getStoredPushToken,
  setPushNotificationsEnabled,
  setStoredPushToken,
} from "./notification-preferences";

let handlerConfigured = false;
let notificationsModulePromise = null;
let appIsActive = AppState.currentState === "active";
let lastReconciledPermission = null;
let foregroundPushEnabled = false;
let foregroundPermissionGranted = false;

export function rememberForegroundPushState(enabled, permission) {
  foregroundPushEnabled = Boolean(enabled);
  foregroundPermissionGranted = permission === "granted";
}

AppState.addEventListener("change", (nextState) => {
  appIsActive = nextState === "active";
});

export function isAppActiveForPush() {
  return appIsActive;
}

function notificationsNativeReady() {
  try {
    // expo-notifications imports expo-application at load time. That file
    // throws if this Expo Go build does not ship ExpoApplication.
    return Boolean(requireOptionalNativeModule("ExpoApplication"));
  } catch {
    return false;
  }
}

export function isRemotePushSupported() {
  if (Platform.OS === "web") return false;
  // Expo Go cannot register this project's remote push token on Android or iOS.
  if (isExpoGo()) return false;
  if (!Device.isDevice) return false;
  if (!notificationsNativeReady()) return false;
  return true;
}

/** Stable codes for Settings UI — never put stack/vendor details in `message`. */
export const PUSH_ERROR = {
  UNSUPPORTED: "unsupported",
  PERMISSION_DENIED: "permission_denied",
  REGISTRATION_FAILED: "registration_failed",
};

function createPushError(code, technicalDetail) {
  const error = new Error(
    typeof technicalDetail === "string" && technicalDetail.trim()
      ? technicalDetail.trim()
      : code,
  );
  error.code = code;
  return error;
}

/** Dev/ops detail only — callers must not show this string in production UI. */
export function getRemotePushUnavailableMessage() {
  if (!Device.isDevice) {
    return i18n.t("push.requiresDevice");
  }

  if (isExpoGo()) {
    return i18n.t("push.expoGo");
  }

  return i18n.t("push.unavailable");
}

async function loadNotificationsModule() {
  if (!isRemotePushSupported()) return null;

  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications")
      .then((mod) => {
        const api = typeof mod?.getPermissionsAsync === "function" ? mod : mod?.default;
        if (!api || typeof api.getPermissionsAsync !== "function") return null;
        return api;
      })
      .catch((err) => {
        console.warn("[push] expo-notifications unavailable", err);
        notificationsModulePromise = null;
        return null;
      });
  }

  return notificationsModulePromise;
}

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

export async function configurePushNotificationHandler() {
  if (handlerConfigured || !isRemotePushSupported()) return;

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;

  if (typeof Notifications.setNotificationHandler !== "function") return;

  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const stored = await getPushNotificationsEnabled().catch(() => false);
      const show = Boolean(stored && foregroundPushEnabled && foregroundPermissionGranted);
      return {
        shouldShowAlert: show,
        shouldPlaySound: show,
        shouldSetBadge: show,
        shouldShowBanner: show,
        shouldShowList: show,
      };
    },
  });
}

async function ensureAndroidChannel(Notifications) {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: i18n.t("push.channelName"),
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#1B4F8A",
    sound: "default",
    enableVibrate: true,
    showBadge: true,
  });
}

export async function getNotificationPermissionStatus() {
  if (!isRemotePushSupported()) return "unsupported";

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return "unsupported";

  if (typeof Notifications.getPermissionsAsync !== "function") return "unsupported";

  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status ?? "undetermined";
  } catch (err) {
    console.warn("[push] permission status unavailable", err);
    return "unsupported";
  }
}

export async function requestNotificationPermission() {
  const current = await getNotificationPermissionStatus();
  if (current === "unsupported") return "unsupported";
  if (current === "granted") return "granted";

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return "unsupported";

  if (typeof Notifications.requestPermissionsAsync !== "function") return "unsupported";

  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status ?? "undetermined";
  } catch (err) {
    console.warn("[push] permission request failed", err);
    return "unsupported";
  }
}

export async function getExpoPushToken() {
  if (!isRemotePushSupported()) {
    throw createPushError(PUSH_ERROR.UNSUPPORTED, getRemotePushUnavailableMessage());
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    throw createPushError(PUSH_ERROR.UNSUPPORTED, getRemotePushUnavailableMessage());
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw createPushError(PUSH_ERROR.REGISTRATION_FAILED, i18n.t("push.missingProjectId"));
  }

  const status = await requestNotificationPermission();
  if (status === "unsupported") {
    throw createPushError(PUSH_ERROR.UNSUPPORTED, getRemotePushUnavailableMessage());
  }
  if (status !== "granted") {
    throw createPushError(PUSH_ERROR.PERMISSION_DENIED, i18n.t("push.permissionDenied"));
  }

  await ensureAndroidChannel(Notifications);

  let tokenResult;
  try {
    tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (err) {
    const raw = String(err?.message ?? err ?? "");
    console.warn("[push] getExpoPushTokenAsync failed", err);
    if (isExpoGo() || /expo go/i.test(raw)) {
      throw createPushError(PUSH_ERROR.UNSUPPORTED, i18n.t("push.expoGo"));
    }
    if (/firebase messaging|google-services|Default FirebaseApp/i.test(raw)) {
      throw createPushError(PUSH_ERROR.REGISTRATION_FAILED, i18n.t("push.firebaseUnavailable"));
    }
    throw createPushError(
      PUSH_ERROR.REGISTRATION_FAILED,
      raw || i18n.t("push.couldNotGetToken"),
    );
  }
  const token = tokenResult?.data?.trim();
  if (!token) {
    throw createPushError(PUSH_ERROR.REGISTRATION_FAILED, i18n.t("push.couldNotGetToken"));
  }

  return token;
}

export async function enablePushNotifications() {
  if (!isRemotePushSupported()) {
    const detail = getRemotePushUnavailableMessage();
    console.warn("[push] remote push unsupported; not enabling", detail);
    throw createPushError(PUSH_ERROR.UNSUPPORTED, detail);
  }

  try {
    const token = await getExpoPushToken();
    const platform = Platform.OS === "ios" ? "ios" : "android";

    await registerDevice({ expoPushToken: token, platform });
    await setPushNotificationsEnabled(true);
    await setStoredPushToken(token);
    rememberForegroundPushState(true, "granted");

    return token;
  } catch (err) {
    if (err?.code === PUSH_ERROR.PERMISSION_DENIED || err?.code === PUSH_ERROR.UNSUPPORTED) {
      throw err;
    }
    console.warn("[push] enable failed", err);
    if (err?.code === PUSH_ERROR.REGISTRATION_FAILED) {
      throw err;
    }
    throw createPushError(
      PUSH_ERROR.REGISTRATION_FAILED,
      String(err?.message ?? err ?? "registration_failed"),
    );
  }
}

export async function disablePushNotifications() {
  const token = await getStoredPushToken();

  try {
    await unregisterDevice(token ? { expoPushToken: token } : {});
  } catch (err) {
    console.warn("[push] unregister failed", err);
  }

  await setPushNotificationsEnabled(false);
  await setStoredPushToken(null);
  rememberForegroundPushState(false, lastReconciledPermission);
  emitNotificationBanner({ dismissAll: true });

  const Notifications = await loadNotificationsModule();
  if (Notifications?.dismissAllNotificationsAsync) {
    await Notifications.dismissAllNotificationsAsync().catch(() => {});
  }
}

/** Remove this device token on sign-out but keep the user's push preference. */
export async function unregisterPushDeviceOnSignOut() {
  const token = await getStoredPushToken();
  if (!token) return;

  try {
    await unregisterDevice({ expoPushToken: token });
  } catch (err) {
    console.warn("[push] sign-out unregister failed", err);
  }

  await setStoredPushToken(null);
}

export async function syncPushNotificationsIfEnabled() {
  const enabled = await getPushNotificationsEnabled();
  if (!enabled) return false;

  const permission = await getNotificationPermissionStatus();
  if (permission !== "granted") return false;

  if (!isRemotePushSupported()) return true;

  try {
    await enablePushNotifications();
    return true;
  } catch (err) {
    console.warn("[push] sync failed", err);
    return false;
  }
}

/**
 * Reload the saved account preference and match it to the current system
 * permission. Does not request permission.
 */
export async function reconcilePushWithDevicePermission() {
  try {
    const accountEnabled = await fetchAccountPushPreference();
    await setPushNotificationsEnabled(accountEnabled);
  } catch {
    // Keep the on-device preference when this account has no saved switch.
  }

  const enabled = await getPushNotificationsEnabled();
  const permission = await getNotificationPermissionStatus();
  const previousPermission = lastReconciledPermission;
  lastReconciledPermission = permission;
  rememberForegroundPushState(enabled, permission);

  if (!enabled) {
    if (await getStoredPushToken()) {
      await disablePushNotifications();
    }
    return false;
  }

  if (permission !== "granted") return false;
  if (!isRemotePushSupported()) return true;

  const permissionJustGranted = Boolean(previousPermission && previousPermission !== "granted");
  if ((await getStoredPushToken()) && !permissionJustGranted) return true;

  try {
    await enablePushNotifications();
    return true;
  } catch (err) {
    console.warn("[push] reconcile failed", err);
    return false;
  }
}

export async function syncNotificationBadgeCount(count) {
  if (!isRemotePushSupported()) return;

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Number(count) || 0));
  } catch (err) {
    console.warn("[push] badge sync failed", err);
  }
}

export async function addPushNotificationReceivedListener(handler) {
  if (!isRemotePushSupported()) {
    return { remove() {} };
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return { remove() {} };
  }

  return Notifications.addNotificationReceivedListener(handler);
}

export async function getInitialNotificationResponse() {
  if (!isRemotePushSupported()) return null;

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return null;

  return Notifications.getLastNotificationResponseAsync();
}

export function handleNotificationResponse(response) {
  const data = response?.notification?.request?.content?.data ?? {};
  const kind = String(data.kind || data.type || "");
  if (kind === "app_update") {
    const platform = getNativePlatform();
    const storeUrl =
      (platform === "ios"
        ? data.ios_store_url || data.store_url || data.action_url || data.actionUrl
        : data.android_store_url || data.store_url || data.action_url || data.actionUrl) ||
      data.action_url ||
      data.actionUrl ||
      null;
    if (storeUrl) {
      Linking.openURL(String(storeUrl)).catch(() => {});
    }
    return null;
  }

  const route = resolvePushNotificationRoute(data);
  if (!route?.pathname) return null;
  return route;
}

export async function addPushNotificationResponseListener(handler) {
  if (!isRemotePushSupported()) {
    return { remove() {} };
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return { remove() {} };
  }

  return Notifications.addNotificationResponseReceivedListener(handler);
}

export function resolvePushNotificationRoute(data = {}) {
  const kind = String(data.kind || data.type || "");
  if (kind === "app_update") {
    // External store link — handled in handleNotificationResponse.
    return null;
  }

  const noticeId = data.noticeId ?? data.notice_id;
  if (noticeId) {
    const category =
      String(data.type ?? "").includes("event") || String(data.category ?? "").toLowerCase() === "event"
        ? "event"
        : String(data.category ?? "general");
    return getNoticeDetailRoute({ id: String(noticeId), category });
  }

  if (data.action_url || data.actionUrl) {
    const action = String(data.action_url ?? data.actionUrl);
    if (/^https?:\/\//i.test(action) && /apps\.apple\.com|play\.google\.com|itunes\.apple\.com/i.test(action)) {
      Linking.openURL(action).catch(() => {});
      return null;
    }
    const route = resolveNotificationRoute({
      actionUrl: action,
      title: data.title ?? "",
      description: data.body ?? "",
      category: data.category ?? null,
      kind: data.kind ?? null,
      type: data.type ?? null,
      documentId: data.document_id ?? data.documentId ?? null,
    });
    if (route?.pathname) return route;
  }

  if (data.conversationId || data.conversation_id) {
    return {
      pathname: "/screens/messages/chat",
      params: {
        conversationId: String(data.conversationId ?? data.conversation_id),
        listingId: data.listingId ?? data.listing_id,
        recipientName: data.recipientName ?? data.actor_name ?? data.actorName,
        recipientRole:
          data.recipientRole ??
          data.recipient_role ??
          data.senderRole ??
          data.sender_role,
      },
    };
  }

  if (String(data.type ?? "").includes("message")) {
    return { pathname: "/screens/messages" };
  }

  // Safe inbox fallback — never navigate to an unknown path.
  return { pathname: "/screens/notification" };
}
