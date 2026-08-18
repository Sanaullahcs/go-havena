"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthShellSkeleton, AdminOnboardingShellSkeleton } from "@/components/shared/loaders";
import {
  getToken,
  getUser,
  clearSession,
  updateUser,
  canAccessCommunityDashboard,
  canAccessCommunityOnboarding,
  communityAdminAccessBlockedCopy,
  getCommunityAdminNextStep,
  isCommunityAdminOnboarding,
  isCommunityAdminUser,
  isSystemAdminUser,
} from "@/lib/auth/session";
import { resolveAdminPortalRedirect } from "@/lib/auth/admin-routes";
import { fetchMe, meToSessionUser } from "@/lib/api/profile";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopBar } from "@/components/admin/top-bar";
import { AdminPushBootstrap } from "@/components/push/admin-push-bootstrap";
import { ForegroundNotificationProvider } from "@/components/push/foreground-notification-provider";
import { consumeWebHandoffIfPresent } from "@/lib/auth/web-handoff";

import {
  communityAdminOnboardingPath,
  isCommunityAdminOnboardingPath,
  onboardingStepFromPath,
} from "@/lib/admin/community-admin-onboarding";
import { AdminOnboardingTopBar } from "@/components/admin/onboarding/onboarding-top-bar";
import { confirmAdminSignOutAndRedirect } from "@/lib/auth/sign-out";

const PAGE_TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/community-admins": "Community Admins",
  "/admin/residents": "Residents",
  "/admin/communities": "Community Requests",
  "/admin/regions": "Regions",
  "/admin/contact-messages": "Contact Messages",
  "/admin/wellness": "Wellness Programs",
  "/admin/billing-plans": "Billing & Plans",
  "/admin/billing-coupons": "Subscription Coupons",
  "/admin/referrals": "Referral Program",
  "/admin/refer-and-earn": "Refer & Earn",
  "/admin/members": "Members",
  "/admin/billing": "Billing",
  "/admin/billing/pay": "Checkout",
  "/admin/billing/done": "Return to app",
  "/admin/setup": "Community setup",
  "/admin/complete-profile": "Complete profile",
  "/admin/pending-approval": "Pending approval",
  "/admin/guests": "Guest Users",
  "/admin/notices": "Notices",
  "/admin/events": "Events",
  "/admin/alerts": "Alerts",
  "/admin/community-rules": "Community Rules",
  "/admin/documents": "Documents",
  "/admin/amenities": "Amenities",
  "/admin/moderation": "Moderation",
  "/admin/marketplace": "Marketplace",
  "/admin/businesses": "Businesses",
  "/admin/messages": "Messages",
  "/admin/activity": "Activity Logs",
  "/admin/notifications": "Notifications",
  "/admin/support": "Help & Support",
  "/admin/profile": "My Profile",
};

function isOnboardingPath(pathname: string) {
  return isCommunityAdminOnboardingPath(pathname);
}

function routeForNextStep(nextStep: string): string {
  return communityAdminOnboardingPath(nextStep);
}

function getTitle(pathname: string) {
  return PAGE_TITLES[pathname] ?? "Admin Portal";
}

/** Use cached session so onboarding admins never flash the full dashboard skeleton. */
function readCachedAdminShell(): {
  checked: boolean;
  onboardingOnly: boolean;
} {
  if (typeof window === "undefined") {
    return { checked: false, onboardingOnly: false };
  }
  const token = getToken();
  if (!token) {
    return { checked: false, onboardingOnly: false };
  }
  const user = getUser();
  if (isCommunityAdminOnboarding(user)) {
    return { checked: true, onboardingOnly: true };
  }
  return { checked: false, onboardingOnly: false };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checked, setChecked] = useState(() => readCachedAdminShell().checked);
  const [accessBlocked, setAccessBlocked] = useState<string | null>(null);
  const [accessBlockedTitle, setAccessBlockedTitle] = useState("Access unavailable");
  const [onboardingOnly, setOnboardingOnly] = useState(
    () => readCachedAdminShell().onboardingOnly,
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await consumeWebHandoffIfPresent();
      if (cancelled) return;

      const token = getToken();
      if (!token) {
        // Always clear the loading shell — otherwise Stripe return on a different host
        // (localhost vs LAN IP) leaves AuthShellSkeleton spinning forever.
        setChecked(true);
        setOnboardingOnly(false);
        router.replace("/login");
        return;
      }

      let user = getUser();

      try {
        const me = await fetchMe();
        if (cancelled) return;
        updateUser(meToSessionUser(me));
        user = getUser();
      } catch {
        // Keep cached session if /me fails (offline / transient).
      }

      if (cancelled) return;

      if (isSystemAdminUser(user)) {
        setAccessBlocked(null);
        setOnboardingOnly(false);
        setChecked(true);
        return;
      }

      if (!isCommunityAdminUser(user)) {
        clearSession();
        setChecked(true);
        setOnboardingOnly(false);
        router.replace("/login");
        return;
      }

      if (!canAccessCommunityOnboarding(user)) {
        const blocked = communityAdminAccessBlockedCopy(user);
        setAccessBlockedTitle(blocked.title);
        setAccessBlocked(blocked.message);
        setOnboardingOnly(false);
        setChecked(true);
        return;
      }

      const nextStep = getCommunityAdminNextStep(user);
      const fullAccess = canAccessCommunityDashboard(user);

      if (!fullAccess) {
        setOnboardingOnly(true);
        setAccessBlocked(null);

        const expected = routeForNextStep(nextStep);
        const onAllowedOnboardingPath =
          isOnboardingPath(pathname) &&
          (pathname === expected ||
            pathname.startsWith(`${expected}/`) ||
            (nextStep === "complete_billing_web" && (pathname === "/admin/billing" || pathname.startsWith("/admin/billing/"))) ||
            (nextStep === "await_approval" &&
              (pathname.startsWith("/admin/pending-approval") || pathname.startsWith("/admin/billing/"))) ||
            (nextStep === "complete_profile" && pathname.startsWith("/admin/complete-profile")) ||
            (nextStep === "link_community" && pathname.startsWith("/admin/setup")) ||
            ((pathname === "/admin/billing" || pathname.startsWith("/admin/billing/")) &&
              (nextStep === "await_approval" || nextStep === "ready")) ||
            (pathname.startsWith("/admin/pending-approval") &&
              nextStep === "complete_billing_web"));

        // Show onboarding shell immediately; redirect in background if needed.
        setChecked(true);

        if (!onAllowedOnboardingPath) {
          router.replace(expected);
        }
        return;
      }

      setOnboardingOnly(false);
      setAccessBlocked(null);
      setChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  useEffect(() => {
    if (!checked || accessBlocked || onboardingOnly) return;

    const user = getUser();
    const redirect = resolveAdminPortalRedirect(pathname, user);
    if (redirect && redirect !== pathname) {
      router.replace(redirect);
    }
  }, [checked, accessBlocked, onboardingOnly, pathname, router]);

  useEffect(() => {
    document.title = `${getTitle(pathname)} · Havena`;
  }, [pathname]);

  if (!checked) {
    const user = getUser();
    if (getToken() && isCommunityAdminOnboarding(user)) {
      return <AdminOnboardingShellSkeleton />;
    }
    return <AuthShellSkeleton />;
  }

  if (accessBlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F8FB] px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Community admin portal</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">{accessBlockedTitle}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{accessBlocked}</p>
          <button
            type="button"
            className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
            onClick={() => {
              void confirmAdminSignOutAndRedirect(router);
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const title = getTitle(pathname);

  // Onboarding shell: no sidebar until full access is unlocked.
  if (onboardingOnly) {
    const onboardingStep = onboardingStepFromPath(pathname);
    const onboardingShellWide = pathname === "/admin/billing" || pathname.startsWith("/admin/billing/");

    return (
      <ForegroundNotificationProvider>
        <div className="min-h-screen overflow-x-hidden bg-[#F6F8FB]">
          <AdminOnboardingTopBar
            title={title}
            step={onboardingStep}
            wide={onboardingShellWide}
            onSignOut={() => {
              void confirmAdminSignOutAndRedirect(router);
            }}
          />
          <main
            className={[
              "mx-auto w-full min-w-0 overflow-x-hidden px-3 py-3 sm:px-6 sm:py-5",
              onboardingShellWide ? "max-w-6xl" : "max-w-3xl",
            ].join(" ")}
          >
            {children}
          </main>
        </div>
      </ForegroundNotificationProvider>
    );
  }

  return (
    <ForegroundNotificationProvider>
      <div className="min-h-screen bg-[#F6F8FB]">
        <AdminSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        <div className="flex min-w-0 flex-col min-h-screen md:ml-60">
          <AdminTopBar title={title} onMenuOpen={() => setDrawerOpen(true)} />

          <main className="min-w-0 flex-1 mx-auto w-full max-w-[1680px] overflow-x-hidden px-4 py-5 sm:px-5 sm:py-6 lg:px-6">
            <AdminPushBootstrap />
            {children}
          </main>
        </div>
      </div>
    </ForegroundNotificationProvider>
  );
}
