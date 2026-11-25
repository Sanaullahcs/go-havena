import { useEffect } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import {
  addPushNotificationReceivedListener,
  addPushNotificationResponseListener,
  configurePushNotificationHandler,
  getInitialNotificationResponse,
  getNotificationPermissionStatus,
  handleNotificationResponse,
  isAppActiveForPush,
  reconcilePushWithDevicePermission,
  syncNotificationBadgeCount,
} from "../../services/push-notifications";
import { getPushNotificationsEnabled } from "../../services/notification-preferences";
import { getCachedUser, getToken, subscribeSessionUser } from "../../services/auth-session";
import { currentCommunityId, isCommunityAdmin, isResidentMode } from "../../services/community-access";
import {
  ensureNotificationCommunityContext,
  fetchNotificationUnreadCount,
} from "../../services/notifications-api";
import { emitMessageUnreadRefresh, emitNotificationRefresh } from "../../services/notification-events";

async function refreshUnreadBadge() {
  try {
    const count = await fetchNotificationUnreadCount();
    const unread = typeof count === "number" ? count : count?.unread ?? 0;
    await syncNotificationBadgeCount(unread);
    emitNotificationRefresh();
    return unread;
  } catch {
    return null;
  }
}

function shouldShowCommunityAdminBanner(data) {
  const user = getCachedUser();
  if (!user || !isCommunityAdmin(user) || isResidentMode(user)) return true;
  if (data?.scope === "account") return true;

  const incoming = data?.community_id ? Number(data.community_id) : null;
  if (!incoming) return true;
  if (user.status === "suspended" || user.community_admin_status !== "approved") return false;

  const allowed = currentCommunityId(user);
  return allowed != null && Number(allowed) === incoming;
}

async function navigateFromNotificationResponse(response) {
  const content = response?.notification?.request?.content;
  const data = content?.data ?? {};
  const route = handleNotificationResponse(response);
  if (!route?.pathname) return;

  const communityId = data.community_id ?? data.communityId ?? null;
  if (communityId) {
    await ensureNotificationCommunityContext({
      communityId,
      community_id: communityId,
    });
  }

  if (router.canDismiss?.()) {
    router.dismissAll();
  }
  router.push(route);
}

export default function PushNotificationBootstrap() {
  useEffect(() => {
    let active = true;
    let receivedSub = { remove() {} };
    let responseSub = { remove() {} };

    (async () => {
      await configurePushNotificationHandler();
      if (!active) return;

      const authToken = await getToken();
      if (authToken) {
        await reconcilePushWithDevicePermission();
        await refreshUnreadBadge();
      }
      if (!active) return;

      const initialResponse = await getInitialNotificationResponse();
      if (initialResponse) {
        navigateFromNotificationResponse(initialResponse);
      }

      receivedSub = await addPushNotificationReceivedListener(async (notification) => {
        const content = notification?.request?.content;
        emitNotificationRefresh();
        refreshUnreadBadge();

        if (!content || !isAppActiveForPush()) return;

        const [enabled, permission] = await Promise.all([
          getPushNotificationsEnabled(),
          getNotificationPermissionStatus(),
        ]);
        if (!enabled || permission !== "granted") return;

        const data = content?.data ?? {};
        const kind = data.kind || "";
        if (!shouldShowCommunityAdminBanner(data)) return;
        if (kind === "message" || kind === "new_message" || data.conversation_id || data.conversationId) {
          emitMessageUnreadRefresh();
        }
      });

      responseSub = await addPushNotificationResponseListener((response) => {
        navigateFromNotificationResponse(response);
        emitNotificationRefresh();
        refreshUnreadBadge();
      });
    })();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        reconcilePushWithDevicePermission().finally(() => {
          refreshUnreadBadge();
        });
      }
    });

    const sessionSub = subscribeSessionUser(() => {
      getToken().then((token) => {
        if (!token) return;
        reconcilePushWithDevicePermission().finally(() => {
          refreshUnreadBadge();
        });
      });
    });

    return () => {
      active = false;
      receivedSub.remove();
      responseSub.remove();
      appStateSub.remove();
      sessionSub();
    };
  }, []);

  return null;
}
