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
import { emitMessageUnreadRefresh, emitNotificationBanner, emitNotificationRefresh } from "../../services/notification-events";
import i18n from "../../i18n";

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
    if (kind === "post_comment" || kind === "post_comment_reply") title = kind === "post_comment_reply" ? i18n.t("pushNotifications.newReply") : i18n.t("pushNotifications.newComment");
    else if (kind === "message" || kind === "new_message") title = i18n.t("pushNotifications.newMessage");
    else if (kind === "post_like") title = i18n.t("pushNotifications.newLike");
    else if (kind === "post_created") title = i18n.t("pushNotifications.newCommunityPost");
    else title = "Havena";
  }

  if (!body) {
    if (kind === "post_comment_reply" && actor) body = i18n.t("pushNotifications.actorReplied", { actor });
    else if (kind === "post_comment" && actor) body = i18n.t("pushNotifications.actorCommented", { actor });
    else if ((kind === "message" || kind === "new_message") && actor) body = i18n.t("pushNotifications.actorMessaged", { actor });
    else if (kind === "post_like" && actor) body = i18n.t("pushNotifications.actorLiked", { actor });
    else if (kind === "post_created" && actor) body = i18n.t("pushNotifications.actorPosted", { actor });
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
        if (kind === "message" || kind === "new_message" || data.kind === "message" || data.conversation_id || data.conversationId) {
          emitMessageUnreadRefresh();
        }
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
