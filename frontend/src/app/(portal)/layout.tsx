"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthShellSkeleton } from "@/components/shared/loaders";
import { getToken } from "@/lib/auth/session";
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
  "/profile":     "My Profile",
  "/support":     "Help & Support",
};

function getTitle(pathname: string) {
  return PAGE_TITLES[pathname] ?? "Resident Portal";
}

export default function ResidentPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/resident-login");
    } else {
      setChecked(true);
    }
  }, [router]);

  useEffect(() => {
    document.title = `${getTitle(pathname)} · Havena`;
  }, [pathname]);

  if (!checked) {
    return <AuthShellSkeleton />;
  }

  const title = getTitle(pathname);

  return (
    <ForegroundNotificationProvider>
      <div className="min-h-screen bg-[#f4f6fb]">
        <WebPushProvider />
        <PortalSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        <div className="flex min-w-0 flex-col min-h-screen md:ml-60">
          <PortalTopBar title={title} onMenuOpen={() => setDrawerOpen(true)} />
          <main className="min-w-0 flex-1 mx-auto w-full max-w-[1680px] overflow-x-hidden px-4 py-5 sm:px-5 sm:py-6 lg:px-6">
            {children}
          </main>
        </div>
      </div>
    </ForegroundNotificationProvider>
  );
}
