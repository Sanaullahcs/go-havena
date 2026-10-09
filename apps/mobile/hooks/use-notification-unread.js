import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import i18n from "../i18n";
import { fetchNotificationUnreadCount } from "../services/notifications-api";
import { subscribeNotificationRefresh } from "../services/notification-events";

export function formatUnreadNotificationLabel(count) {
  if (!count || count <= 0) return i18n.t("notifications.noNew");
  if (count === 1) return i18n.t("notifications.oneNew");
  return i18n.t("notifications.countNew", { count });
}

export function formatUnreadBadgeCount(count) {
  if (!count || count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

export function useNotificationUnread({ refreshOnFocus = true } = {}) {
  const [unread, setUnread] = useState(0);
  const [messageAlerts, setMessageAlerts] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const count = await fetchNotificationUnreadCount();
      const total = typeof count === "number" ? count : count?.unread ?? 0;
      const alerts = typeof count === "number" ? 0 : count?.messageAlerts ?? 0;
      setUnread(total);
      setMessageAlerts(alerts);
      return total;
    } catch {
      return null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!refreshOnFocus) return undefined;
      refresh();
      return undefined;
    }, [refresh, refreshOnFocus]),
  );

  useEffect(() => {
    if (!refreshOnFocus) return undefined;
    return subscribeNotificationRefresh(refresh);
  }, [refresh, refreshOnFocus]);

  useEffect(() => {
    if (!refreshOnFocus) return undefined;

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
      }
    });

    const intervalId = setInterval(refresh, 60000);

    return () => {
      sub.remove();
      clearInterval(intervalId);
    };
  }, [refresh, refreshOnFocus]);

  return { unread, messageAlerts, refresh, setUnread };
}
