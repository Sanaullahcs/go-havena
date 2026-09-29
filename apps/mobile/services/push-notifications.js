import i18n from "../i18n";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { AppState, Linking, Platform } from "react-native";
import { registerDevice, unregisterDevice } from "./devices-api";
import { getNoticeDetailRoute } from "./notices-api";
import { resolveNotificationRoute } from "./notifications-api";
import { getNativePlatform } from "./app-version";
import {
  getPushNotificationsEnabled,
  getStoredPushToken,
  setPushNotificationsEnabled,
  setStoredPushToken,
} from "./notification-preferences";

let handlerConfigured = false;
let notificationsModulePromise = null;
let appIsActive = AppState.currentState === "active";

AppState.addEventListener("change", (nextState) => {
  appIsActive = nextState === "active";
});

export function isAppActiveForPush() {
  return appIsActive;
}

/** Remote Expo push is not available in Expo Go on Android (SDK 53+). */
function isExpoGoClient() {
  return (
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  );
}

export function isRemotePushSupported() {
  if (Platform.OS === "web") return false;
  if (!Device.isDevice) return false;
  if (isExpoGoClient() && Platform.OS === "android") return false;
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

  const isExpoGo = isExpoGoClient();
  if (isExpoGo && Platform.OS === "android") {
    return i18n.t("push.expoGoAndroid");
  }

  return i18n.t("push.unavailable");
}

async function loadNotificationsModule() {
  if (!isRemotePushSupported()) return null;

  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications")
      .then((mod) => mod)
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

  handlerConfigured = true;
  // Foreground handler: never show the native OS banner (it auto-dismisses).
  // Our in-app notification list handles all foreground display.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
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

  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function requestNotificationPermission() {
  const current = await getNotificationPermissionStatus();
  if (current === "unsupported") return "unsupported";
  if (current === "granted") return "granted";

  const Notifications = await loadNotificationsModule();
  if (!Notifications) return "unsupported";

  const { status } = await Notifications.requestPermissionsAsync();
  return status;
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

  if (!isRemotePushSupported()) return true;

  try {
    await enablePushNotifications();
    return true;
  } catch (err) {
    console.warn("[push] sync failed", err);
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
      },
    };
  }

  if (String(data.type ?? "").includes("message")) {
    return { pathname: "/screens/messages" };
  }

  // Safe inbox fallback — never navigate to an unknown path.
  return { pathname: "/screens/notification" };
}
