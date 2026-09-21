"use client";

import { BellRing } from "lucide-react";
import { sendTestPush } from "@/lib/api/devices";
import { isFirebaseWebConfigured } from "@/lib/firebase/config";
import { enableWebPush, notifyWebPushChanged } from "@/lib/firebase/web-push";
import { useWebPushStatus } from "@/hooks/use-web-push-status";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import { useState } from "react";

function PushStatusBadge({ compact, active }: { compact?: boolean; active: boolean }) {
  if (!isFirebaseWebConfigured()) {
    return null;
  }

  return (
    <span
      className={
        compact
          ? "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold"
          : "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-semibold"
      }
      style={
        active
          ? { borderColor: "rgba(16, 185, 129, 0.25)", background: "#ECFDF5", color: "#047857" }
          : { borderColor: "rgba(148, 163, 184, 0.35)", background: "#F8FAFC", color: "#64748B" }
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300"}`}
        aria-hidden
      />
      {active ? "Push on" : "Push off"}
    </span>
  );
}

export function PushNotificationTestButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const { active, permission } = useWebPushStatus();

  const handleClick = async () => {
    if (busy) return;

    if (!isFirebaseWebConfigured()) {
      toastError(
        "Firebase web push is not configured. Add NEXT_PUBLIC_FIREBASE_* values to frontend/.env.local, then run npm run firebase:sw.",
      );
      return;
    }

    setBusy(true);
    try {
      if (permission === "denied") {
        toastError(
          "Notifications are blocked in your browser. Enable them in site settings, then reload the dashboard.",
        );
        return;
      }

      // Re-register on every test click (user gesture) so stale local state still upserts the device.
      const enrolled = await enableWebPush();
      if (!enrolled.ok) {
        toastError(enrolled.message);
        return;
      }
      notifyWebPushChanged();

      const result = await sendTestPush({
        title: "Havena test",
        body: "Push notifications are working!",
      });
      toastSuccess(result.message ?? "Test push sent.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <PushStatusBadge compact={compact} active={active} />
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={
          compact
            ? "nl-btn-secondary inline-flex h-8 items-center gap-1 px-2.5 text-[12px]"
            : "nl-btn-secondary inline-flex items-center gap-1.5"
        }
        aria-label="Send test push notification"
      >
        <BellRing className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        {busy ? "Sending…" : "Test push"}
      </button>
    </div>
  );
}
