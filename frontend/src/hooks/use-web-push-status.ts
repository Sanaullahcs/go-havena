"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getWebPushPermission,
  isWebPushActive,
  type WebPushPermission,
} from "@/lib/firebase/web-push";

export function useWebPushStatus() {
  const [active, setActive] = useState(false);
  const [permission, setPermission] = useState<WebPushPermission>("default");

  const refresh = useCallback(() => {
    setPermission(getWebPushPermission());
    setActive(isWebPushActive());
  }, []);

  useEffect(() => {
    refresh();

    window.addEventListener("nbr:web-push-changed", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("nbr:web-push-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return { active, permission };
}
