import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { fetchNotificationUnreadCount } from "../services/notifications-api";
import { subscribeNotificationRefresh } from "../services/notification-events";

export function formatUnreadNotificationLabel(count) {
  if (!count || count <= 0) return "No new notifications";
  if (count === 1) return "1 new notification";
  return `${count} new notifications`;
}

export function formatUnreadBadgeCount(count) {
  if (!count || count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

export function useNotificationUnread({ refreshOnFocus = true } = {}) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const count = await fetchNotificationUnreadCount();
      setUnread(count);
      return count;
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

    const intervalId = setInterval(refresh, 30000);

    return () => {
      sub.remove();
      clearInterval(intervalId);
    };
  }, [refresh, refreshOnFocus]);

  return { unread, refresh, setUnread };
}
