import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchMessageUnreadCount } from "../services/messages-api";
import { subscribeMessageUnreadRefresh } from "../services/notification-events";

export function useMessageUnread({ refreshOnFocus = true } = {}) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const count = await fetchMessageUnreadCount();
      setUnread(count);
      return count;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => subscribeMessageUnreadRefresh(() => {
    refresh();
  }), [refresh]);

  useFocusEffect(
    useCallback(() => {
      if (!refreshOnFocus) return undefined;
      refresh();
      return undefined;
    }, [refresh, refreshOnFocus]),
  );

  return { unread, refresh, setUnread };
}
