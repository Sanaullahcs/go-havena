"use client";

import { useEffect } from "react";
import { fetchMe } from "@/lib/api/profile";
import { getToken, getUser, updateUser } from "@/lib/auth/session";

export const FEATURES_UPDATED_EVENT = "nbr-features-updated";

const POLL_MS = 8000;

function featuresSignature(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

/** Write the latest /me feature payload into the session and notify open screens. */
export async function refreshFeatureSession() {
  if (!getToken()) return null;
  const me = await fetchMe();
  const next = me.resident_features ?? null;
  updateUser({ resident_features: next }, { silent: true });
  window.dispatchEvent(new CustomEvent(FEATURES_UPDATED_EVENT));
  return next;
}

/** Pull the latest community feature flags so open dashboards drop stale cards. */
export function FeatureSettingsSync() {
  useEffect(() => {
    let stopped = false;
    let timer = 0;

    const tick = async () => {
      if (stopped || document.visibilityState === "hidden" || !getToken()) return;
      try {
        const me = await fetchMe();
        const next = me.resident_features ?? null;
        const previous = getUser()?.resident_features ?? null;
        if (featuresSignature(previous) === featuresSignature(next)) return;
        updateUser({ resident_features: next }, { silent: true });
        window.dispatchEvent(new CustomEvent(FEATURES_UPDATED_EVENT));
      } catch {
        // Keep the last flags if this poll fails.
      }
    };

    const start = () => {
      window.clearInterval(timer);
      void tick();
      timer = window.setInterval(() => void tick(), POLL_MS);
    };

    start();
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
