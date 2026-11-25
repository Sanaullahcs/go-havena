import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { getToken } from "../../services/auth-session";
import { fetchAccountPushPreference } from "../../services/devices-api";
import {
  ensureNotificationCommunityContext,
  fetchNotifications,
  resolveNotificationRoute,
} from "../../services/notifications-api";
import {
  getPushNotificationsEnabled,
  setPushNotificationsEnabled,
} from "../../services/notification-preferences";
import {
  emitMessageUnreadRefresh,
  emitNotificationBanner,
  emitNotificationRefresh,
} from "../../services/notification-events";
import {
  isRemotePushSupported,
  rememberForegroundPushState,
  resolvePushNotificationRoute,
} from "../../services/push-notifications";
import { isExpoGo } from "../../utils/expo-runtime";

const POLL_MS = 20000;

/**
 * Fallback for Android Expo Go: poll the API and surface new alerts in-app
 * while the app process is alive (foreground + short background periods).
 */
export default function InAppNotificationMonitor() {
  const lastSeenIdRef = useRef(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    // Expo Go does not mount the push listener, including on iOS.
    if (isRemotePushSupported() && !isExpoGo()) return undefined;

    let active = true;
    let intervalId = null;

    const poll = async () => {
      if (!active || pollingRef.current) return;
      pollingRef.current = true;

      try {
        const [authToken, enabled] = await Promise.all([
          getToken(),
          getPushNotificationsEnabled(),
        ]);
        if (!authToken || !enabled) return;

        try {
          const accountEnabled = await fetchAccountPushPreference();
          if (!accountEnabled) {
            await setPushNotificationsEnabled(false);
            rememberForegroundPushState(false, "denied");
            return;
          }
        } catch {
          // Keep the saved device preference when the account lookup fails.
        }

        const stillEnabled = await getPushNotificationsEnabled();
        if (!stillEnabled) return;

        const { notifications, unread } = await fetchNotifications({ page: 1, perPage: 5 });
        emitNotificationRefresh();

        const latest = notifications.find((item) => !item.read) ?? notifications[0];
        if (!latest?.id) return;

        const lastSeenId = lastSeenIdRef.current;
        if (lastSeenId === null) {
          lastSeenIdRef.current = latest.id;
          return;
        }

        if (latest.id === lastSeenId || latest.read) return;

        lastSeenIdRef.current = latest.id;
        const allowed = await getPushNotificationsEnabled();
        if (!allowed) return;

        if (latest.kind === "message") {
          emitMessageUnreadRefresh();
        }
        const route =
          resolveNotificationRoute(latest)
          ?? resolvePushNotificationRoute({
              actionUrl: latest.actionUrl,
              title: latest.title,
              body: latest.description,
              kind: latest.kind,
              type: latest.type,
              documentId: latest.documentId,
              assignment_id: latest.assignmentId,
              open_signed: latest.openSignedPdf,
              community_id: latest.communityId,
            });

        emitNotificationBanner({
          id: latest.id ? String(latest.id) : undefined,
          title: latest.title,
          body: latest.description,
          kind: latest.kind,
          type: latest.type,
          actionUrl: latest.actionUrl,
          onPress: route?.pathname
            ? () => {
                ensureNotificationCommunityContext(latest)
                  .then(() => {
                    if (router.canDismiss?.()) router.dismissAll();
                    router.push(route);
                  })
                  .catch(() => {});
              }
            : undefined,
        });

        if (unread > 0) {
          emitNotificationRefresh();
        }
      } catch (err) {
        console.warn("[notifications] poll failed", err);
      } finally {
        pollingRef.current = false;
      }
    };

    const startPolling = () => {
      poll();
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(poll, POLL_MS);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    startPolling();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        startPolling();
        return;
      }
      if (state === "background") {
        // Keep polling briefly while JS stays alive in background.
        startPolling();
      }
      if (state === "inactive") {
        stopPolling();
      }
    });

    return () => {
      active = false;
      stopPolling();
      sub.remove();
    };
  }, []);

  return null;
}
