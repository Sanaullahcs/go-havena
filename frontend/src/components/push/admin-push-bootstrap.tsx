"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { isFirebaseWebConfigured } from "@/lib/firebase/config";
import {
  autoEnrollWebPushOnDashboard,
  dismissDeniedBanner,
  getWebPushPermission,
  isDeniedBannerDismissed,
  notifyWebPushChanged,
} from "@/lib/firebase/web-push";

const DASHBOARD_AUTO_ENROLL_DELAY_MS = 1200;

function PushDeniedBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sky-950 shadow-sm">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm">
        <BellRing className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-sky-950">Browser notifications are blocked</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-sky-900/80">
          Allow notifications for this site in your browser settings to receive Firebase push updates on the dashboard.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sky-500 transition hover:bg-white hover:text-sky-700"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}

/** Runs once per admin shell mount — not on every sidebar navigation. */
export function AdminPushBootstrap() {
  const [showDeniedBanner, setShowDeniedBanner] = useState(false);

  const refreshPushState = useCallback(() => {
    const permission = getWebPushPermission();
    setShowDeniedBanner(
      isFirebaseWebConfigured() &&
        permission === "denied" &&
        !isDeniedBannerDismissed(),
    );
  }, []);

  useEffect(() => {
    if (!isFirebaseWebConfigured()) return undefined;

    let cancelled = false;
    const enrollTimer = setTimeout(async () => {
      if (cancelled) return;
      await autoEnrollWebPushOnDashboard();
      notifyWebPushChanged();
      if (!cancelled) refreshPushState();
    }, DASHBOARD_AUTO_ENROLL_DELAY_MS);

    refreshPushState();

    return () => {
      cancelled = true;
      clearTimeout(enrollTimer);
    };
  }, [refreshPushState]);

  if (!showDeniedBanner) {
    return null;
  }

  return (
    <PushDeniedBanner
      onDismiss={() => {
        dismissDeniedBanner();
        setShowDeniedBanner(false);
      }}
    />
  );
}
