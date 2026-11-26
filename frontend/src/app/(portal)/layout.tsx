"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthShellSkeleton } from "@/components/shared/loaders";
import { FEATURES_UPDATED_EVENT, FeatureSettingsSync } from "@/components/auth/feature-settings-sync";
import { getToken, getUser } from "@/lib/auth/session";
import { residentPathAllowed } from "@/lib/resident-features";
import { consumeWebHandoffIfPresent } from "@/lib/auth/web-handoff";
import { PortalSidebar } from "@/components/portal/sidebar";
import { PortalTopBar } from "@/components/portal/top-bar";
import { WebPushProvider } from "@/components/push/web-push-provider";
import { ForegroundNotificationProvider } from "@/components/push/foreground-notification-provider";

const PAGE_TITLES: Record<string, string> = {
  "/home":        "Home",
  "/notices":     "Notices",
  "/feed":        "Community Feed",
  "/messages":    "Messages",
  "/wellness":    "Wellness",
  "/marketplace": "Marketplace",
  "/property":    "Property",
  "/units":       "My Units",
  "/payments":    "Payments",
  "/profile":     "My Profile",
  "/support":     "Help & Support",
  "/landlord":    "Landlord",
};

function getTitle(pathname: string) {
  return PAGE_TITLES[pathname] ?? "Resident Portal";
}

export default function ResidentPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [featureRevision, setFeatureRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await consumeWebHandoffIfPresent();
      if (cancelled) return;
      if (!getToken()) {
        router.replace("/resident-login");
      } else {
        setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    document.title = `${getTitle(pathname)} · Havena`;
  }, [pathname]);

  useEffect(() => {
    const sync = () => setFeatureRevision((current) => current + 1);
    window.addEventListener(FEATURES_UPDATED_EVENT, sync);
    return () => window.removeEventListener(FEATURES_UPDATED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!checked) return;
    if (!residentPathAllowed(pathname, getUser()?.resident_features)) {
      router.replace("/home");
    }
  }, [checked, pathname, router, featureRevision]);

  if (!checked) {
    return <AuthShellSkeleton />;
  }

  const title = getTitle(pathname);

  return (
    <ForegroundNotificationProvider>
      <div className="min-h-dvh overflow-x-hidden bg-[#F4F8FD]">
        <FeatureSettingsSync />
        <WebPushProvider />
        <PortalSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden md:ml-60">
          <PortalTopBar title={title} onMenuOpen={() => setDrawerOpen(true)} />
          <main key={featureRevision} className="mx-auto w-full min-w-0 max-w-[1680px] flex-1 overflow-x-hidden px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-6 lg:px-6">
            {children}
          </main>
        </div>
      </div>
    </ForegroundNotificationProvider>
  );
}
