"use client";

import { useEffect } from "react";
import { syncWebPushIfEnabled } from "@/lib/firebase/web-push";

/** Keeps the FCM token registered; foreground UI is handled by ForegroundNotificationProvider. */
export function WebPushProvider() {
  useEffect(() => {
    void syncWebPushIfEnabled();
  }, []);

  return null;
}
