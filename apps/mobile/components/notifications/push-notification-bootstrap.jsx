import { useEffect } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import {
  addPushNotificationReceivedListener,
  addPushNotificationResponseListener,
  configurePushNotificationHandler,
  getInitialNotificationResponse,
  handleNotificationResponse,
  syncNotificationBadgeCount,
  syncPushNotificationsIfEnabled,
} from "../../services/push-notifications";
import { getToken } from "../../services/auth-session";
import { fetchNotificationUnreadCount } from "../../services/notifications-api";
import { emitNotificationBanner, emitNotificationRefresh } from "../../services/notification-events";

async function refreshUnreadBadge() {
  try {
    const unread = await fetchNotificationUnreadCount();
    await syncNotificationBadgeCount(unread);
    emitNotificationRefresh();
    return unread;
  } catch {
    return null;
  }
}

function navigateFromNotificationResponse(response) {
  const route = handleNotificationResponse(response);
  if (!route?.pathname) return;

  if (router.canDismiss?.()) {
    router.dismissAll();
  }
  router.push(route);
}

function extractNotificationContent(content) {
  const data = content?.data ?? {};
  let title = content?.title || data.title || data.push_title || "";
  let body = content?.body || data.body || data.push_body || "";
  const kind = data.kind || "";
  const type = data.type || "";
  const actor = data.actor_name || data.actorName || "";

  if (!title) {
    if (kind === "post_comment" || kind === "post_comment_reply") title = kind === "post_comment_reply" ? "New reply" : "New comment";
    else if (kind === "message" || kind === "new_message") title = "New message";
    else if (kind === "post_like") title = "New like";
    else if (kind === "post_created") title = "New community post";
    else title = "NeighborLink";
  }

  if (!body) {
    if (kind === "post_comment_reply" && actor) body = `${actor} replied to your comment.`;
    else if (kind === "post_comment" && actor) body = `${actor} commented on your post.`;
    else if ((kind === "message" || kind === "new_message") && actor) body = `${actor} sent you a message.`;
    else if (kind === "post_like" && actor) body = `${actor} liked your post.`;
    else if (kind === "post_created" && actor) body = `${actor} shared a new post in your community.`;
  }

  return { title, body, kind, type };
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
        await syncPushNotificationsIfEnabled();
        await refreshUnreadBadge();
      }
      if (!active) return;

      const initialResponse = await getInitialNotificationResponse();
      if (initialResponse) {
        navigateFromNotificationResponse(initialResponse);
      }

      receivedSub = await addPushNotificationReceivedListener((notification) => {
        const content = notification?.request?.content;
        emitNotificationRefresh();
        refreshUnreadBadge();

        if (!content) return;

        const { title, body, kind, type } = extractNotificationContent(content);
        const data = content?.data ?? {};
        const tag = data.kind && data.post_id ? `${data.kind}-${data.post_id}` : data.kind || null;
        const actionUrl = data.action_url || data.actionUrl || null;
        emitNotificationBanner({
          id: tag,
          title,
          body,
          kind: kind || data.kind || "",
          type: type || data.type || "",
          actionUrl,
          onPress: () => navigateFromNotificationResponse({ notification }),
        });
      });

      responseSub = await addPushNotificationResponseListener((response) => {
        navigateFromNotificationResponse(response);
        emitNotificationRefresh();
        refreshUnreadBadge();
      });
    })();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshUnreadBadge();
      }
    });

    return () => {
      active = false;
      receivedSub.remove();
      responseSub.remove();
      appStateSub.remove();
    };
  }, []);

  return null;
}
