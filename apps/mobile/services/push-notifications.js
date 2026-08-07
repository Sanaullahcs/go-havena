import i18n from "../i18n";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { AppState } from "react-native";
import { Platform } from "react-native";
import { registerDevice, unregisterDevice } from "./devices-api";
import { getNoticeDetailRoute } from "./notices-api";
import { resolveNotificationRoute } from "./notifications-api";
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

/** Remote Expo push is not available in Android Expo Go (SDK 53+). */
export function isRemotePushSupported() {
  if (Platform.OS === "web") return false;
  if (!Device.isDevice) return false;

  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  if (isExpoGo && Platform.OS === "android") return false;

  return true;
}

export function getRemotePushUnavailableMessage() {
  if (!Device.isDevice) {
    return i18n.t("push.requiresDevice");
  }

  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
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
    lightColor: "#0A2A43",
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
    throw new Error(getRemotePushUnavailableMessage());
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    throw new Error(getRemotePushUnavailableMessage());
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error(i18n.t("push.missingProjectId"));
  }

  const status = await requestNotificationPermission();
  if (status === "unsupported") {
    throw new Error(getRemotePushUnavailableMessage());
  }
  if (status !== "granted") {
    throw new Error(i18n.t("push.permissionDenied"));
  }

  await ensureAndroidChannel(Notifications);

  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResult?.data?.trim();
  if (!token) {
    throw new Error(i18n.t("push.couldNotGetToken"));
  }

  return token;
}

export async function enablePushNotifications() {
  if (!isRemotePushSupported()) {
    await setPushNotificationsEnabled(true);
    return null;
  }

  const token = await getExpoPushToken();
  const platform = Platform.OS === "ios" ? "ios" : "android";

  await registerDevice({ expoPushToken: token, platform });
  await setPushNotificationsEnabled(true);
  await setStoredPushToken(token);

  return token;
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
  const noticeId = data.noticeId ?? data.notice_id;
  if (noticeId) {
    const category =
      String(data.type ?? "").includes("event") || String(data.category ?? "").toLowerCase() === "event"
        ? "event"
        : String(data.category ?? "general");
    return getNoticeDetailRoute({ id: String(noticeId), category });
  }

  if (data.action_url || data.actionUrl) {
    const route = resolveNotificationRoute({
      actionUrl: data.action_url ?? data.actionUrl,
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
