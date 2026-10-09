"use client";

import { useEffect, useState } from "react";
import { toastError } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  fetchPushNotificationPreference,
  updatePushNotificationPreference,
} from "@/lib/api/push-preference";
import { NL } from "@/lib/design-tokens";
import { enableWebPush } from "@/lib/firebase/web-push";

export function PushNotificationsToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchPushNotificationPreference()
        .then((preference) => {
          if (!cancelled) setEnabled(preference.enabled);
        })
        .catch(() => {
          if (!cancelled) setEnabled(true);
        });
    };
    load();
    window.addEventListener("nbr-session-updated", load);
    return () => {
      cancelled = true;
      window.removeEventListener("nbr-session-updated", load);
    };
  }, []);

  const onToggle = async () => {
    if (enabled === null || saving) return;
    const next = !enabled;
    setSaving(true);
    setEnabled(next);
    try {
      const saved = await updatePushNotificationPreference(next);
      setEnabled(saved.enabled);
      if (saved.enabled) {
        const registered = await enableWebPush();
        if (!registered.ok) {
          toastError(registered.message);
        }
      }
    } catch (err) {
      setEnabled(!next);
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const on = enabled === true;
  const pending = enabled === null || saving;

  return (
    <div className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: NL.textPrimary }}>
          Push Notifications
        </p>
        <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: NL.textMuted }}>
          Deliver alerts and notices to your devices
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label="Push Notifications"
        aria-checked={on}
        disabled={pending}
        onClick={() => void onToggle()}
        className="flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 disabled:cursor-wait disabled:opacity-60"
        style={{
          borderColor: on ? NL.brandPrimary : "#CBD5E1",
          background: on ? NL.brandPrimary : "#E2E8F0",
        }}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
