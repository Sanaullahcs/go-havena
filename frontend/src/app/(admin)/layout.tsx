"use client";

import { useState, useEffect, useLayoutEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthShellSkeleton, AdminOnboardingShellSkeleton } from "@/components/shared/loaders";
import {
  getToken,
  getUser,
  updateUser,
  canAccessCommunityDashboard,
  canAccessCommunityOnboarding,
  communityAdminAccessBlockedCopy,
  getCommunityAdminNextStep,
  getManagedCommunityId,
  isCommunityAdminOnboarding,
  isCommunityAdminUser,
  isResidentMode,
  isSystemAdminUser,
} from "@/lib/auth/session";
import { resolveAdminPortalRedirect } from "@/lib/auth/admin-routes";
import { adminFeatureForPath, isResidentFeatureEnabled } from "@/lib/resident-features";
import { fetchMe, meToSessionUser } from "@/lib/api/profile";
import { switchToAdminMode } from "@/lib/auth/resident-mode";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopBar } from "@/components/admin/top-bar";
import { AdminPushBootstrap } from "@/components/push/admin-push-bootstrap";
import { ForegroundNotificationProvider } from "@/components/push/foreground-notification-provider";
import { consumeWebHandoffIfPresent, readHandoffCodeFromLocation } from "@/lib/auth/web-handoff";
import { FEATURES_UPDATED_EVENT, FeatureSettingsSync } from "@/components/auth/feature-settings-sync";

import {
  communityAdminOnboardingPath,
  isCommunityAdminOnboardingPath,
  onboardingStepFromPath,
} from "@/lib/admin/community-admin-onboarding";
import { AdminOnboardingTopBar } from "@/components/admin/onboarding/onboarding-top-bar";
import { COMPLETE_PROFILE_SIGN_OUT_MESSAGE, confirmAdminSignOutAndRedirect } from "@/lib/auth/sign-out";

const PAGE_TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/community-admins": "Community Admins",
  "/admin/residents": "Residents",
  "/admin/communities": "Community Requests",
  "/admin/regions": "Regions",
  "/admin/request-demo": "Request a Demo",
  "/admin/contact-messages": "Request a Demo",
  "/admin/wellness": "Wellness Programs",
  "/admin/billing-plans": "Billing & Plans",
  "/admin/billing-coupons": "Subscription Coupons",
  "/admin/referrals": "Referral Program",
  "/admin/app-version": "App Version Management",
  "/admin/refer-and-earn": "Refer & Earn",
  "/admin/members": "Members",
  "/admin/billing": "Billing",
  "/admin/plaid": "Plaid",
  "/admin/kuickpay": "KuickPay",
  "/admin/billing/pay": "Checkout",
  "/admin/billing/done": "Return to app",
  "/admin/setup": "Community setup",
  "/admin/complete-profile": "Complete profile",
  "/admin/feature-settings": "Adjust Features",
  "/admin/feature-requests": "Feature Requests",
  "/admin/pending-approval": "Pending approval",
  "/admin/guests": "Guest Users",
  "/admin/notices": "Notices",
  "/admin/events": "Events",
  "/admin/alerts": "Alerts",
  "/admin/community-rules": "Community Rules",
  "/admin/documents": "Documents & Agreements",
  "/admin/complaints": "Complaints",
  "/admin/staff": "Staff",
  "/admin/support-complaints": "Complaints & Support",
  "/admin/agreements": "Documents & Agreements",
  "/admin/units": "Units",
  "/admin/services": "Services",
  "/admin/local-essentials": "Local Essentials",
  "/admin/service-bills": "Service Bills",
  "/admin/amenities": "Amenities",
  "/admin/amenity-bills": "Amenity Bills",
  "/admin/bookings": "Booking Request",
  "/admin/feed": "Feed Moderation",
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
  // Never flash cached session while the mobile app handoff code is still in the URL.
  if (readHandoffCodeFromLocation()) {
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

function isBillingOrOnboardingPath(pathname: string) {
  return (
    isOnboardingPath(pathname) ||
    pathname === "/admin/billing" ||
    pathname.startsWith("/admin/billing/")
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Always start unchecked so SSR HTML matches the first client render (no localStorage on server).
  const [checked, setChecked] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState<string | null>(null);
  const [accessBlockedTitle, setAccessBlockedTitle] = useState("Access unavailable");
  const [onboardingOnly, setOnboardingOnly] = useState(false);

  // Apply cached session before paint so onboarding admins skip the dashboard skeleton flash.
  useLayoutEffect(() => {
    const cached = readCachedAdminShell();
    if (cached.checked) {
      setChecked(true);
      setOnboardingOnly(cached.onboardingOnly);
    }
  }, []);

  const refreshAccess = useCallback(async () => {
    await consumeWebHandoffIfPresent();

    const token = getToken();
    if (!token) {
      setChecked(true);
      setOnboardingOnly(false);
      const qs = typeof window !== "undefined" ? window.location.search : "";
      router.replace(qs ? `/login${qs}` : "/login");
      return;
    }

    let user = getUser();

    try {
      const me = await fetchMe();
      updateUser(meToSessionUser(me), { silent: true });
      user = getUser();
    } catch {
      // Keep cached session if /me fails (offline / transient).
    }

    if (isSystemAdminUser(user) && !isCommunityAdminUser(user)) {
      setAccessBlocked(null);
      setOnboardingOnly(false);
      setChecked(true);
      return;
    }

    if (!isCommunityAdminUser(user)) {
      setChecked(true);
      setOnboardingOnly(false);
      router.replace(user?.role === "resident" || user?.role === "guest" ? "/home" : "/login");
      return;
    }

    if (isResidentMode(user)) {
      try {
        user = await switchToAdminMode(getManagedCommunityId(user));
      } catch {
        // Opening the Community Admin URL must stay in the CA portal.
      }
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
          (nextStep === "complete_billing_web" &&
            (pathname === "/admin/billing" || pathname.startsWith("/admin/billing/"))) ||
          (nextStep === "configure_resident_features" &&
            pathname.startsWith("/admin/pending-approval")) ||
          (nextStep === "await_approval" &&
            (pathname.startsWith("/admin/pending-approval") || pathname.startsWith("/admin/billing/"))) ||
          (nextStep === "complete_profile" && pathname.startsWith("/admin/complete-profile")) ||
          (nextStep === "link_community" && pathname.startsWith("/admin/setup")) ||
          ((pathname === "/admin/billing" || pathname.startsWith("/admin/billing/")) &&
            (nextStep === "await_approval" || nextStep === "ready")) ||
          (pathname.startsWith("/admin/pending-approval") && nextStep === "complete_billing_web"));

      setChecked(true);

      if (!onAllowedOnboardingPath) {
        router.replace(expected);
      }
      return;
    }

    setOnboardingOnly(false);
    setAccessBlocked(null);
    setChecked(true);
  }, [pathname, router]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  useEffect(() => {
    const onSessionUpdated = () => {
      void refreshAccess();
    };
    window.addEventListener("nbr-session-updated", onSessionUpdated);
    return () => window.removeEventListener("nbr-session-updated", onSessionUpdated);
  }, [refreshAccess]);

  useEffect(() => {
    if (!checked || accessBlocked || onboardingOnly) return;

    const applyFeatureGate = () => {
      const user = getUser();
      const redirect = resolveAdminPortalRedirect(pathname, user);
      if (redirect && redirect !== pathname) {
        router.replace(redirect);
        return;
      }

      if (isCommunityAdminUser(user) && !isSystemAdminUser(user)) {
        const featureKey = adminFeatureForPath(pathname);
        if (featureKey && !isResidentFeatureEnabled(user?.resident_features, featureKey) && pathname !== "/admin") {
          router.replace("/admin");
        }
      }
    };

    applyFeatureGate();
    window.addEventListener(FEATURES_UPDATED_EVENT, applyFeatureGate);
    return () => window.removeEventListener(FEATURES_UPDATED_EVENT, applyFeatureGate);
  }, [checked, accessBlocked, onboardingOnly, pathname, router]);

  useEffect(() => {
    document.title = `${getTitle(pathname)} · Havena`;
  }, [pathname]);

  if (!checked) {
    // Pathname-only choice keeps SSR and first client paint identical (no localStorage).
    if (isBillingOrOnboardingPath(pathname)) {
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
            className="mt-6 rounded-xl bg-[#1B4F8A] px-5 py-2.5 text-sm font-semibold text-white"
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
    return (
      <ForegroundNotificationProvider>
        <div className="min-h-screen overflow-x-hidden bg-[#F6F8FB]">
          <AdminOnboardingTopBar
            title={title}
            step={onboardingStep}
            wide
            onSignOut={() => {
              void confirmAdminSignOutAndRedirect(
                router,
                "/login",
                pathname.startsWith("/admin/complete-profile")
                  ? { text: COMPLETE_PROFILE_SIGN_OUT_MESSAGE }
                  : undefined,
              );
            }}
          />
          <main
            className={[
              "mx-auto w-full min-w-0 overflow-x-hidden sm:px-6 sm:py-6 lg:px-8 lg:py-8",
              pathname.startsWith("/admin/billing") ? "px-3 py-3" : "px-4 py-4",
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
        <FeatureSettingsSync />
        <AdminSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        <div className="flex min-w-0 flex-col min-h-screen md:ml-60">
          <AdminTopBar title={title} onMenuOpen={() => setDrawerOpen(true)} />

          <main className="mx-auto min-w-0 w-full max-w-[1680px] flex-1 overflow-x-hidden px-4 py-3 sm:px-5 sm:py-4 lg:px-6">
            <AdminPushBootstrap />
            {children}
          </main>
        </div>
      </div>
    </ForegroundNotificationProvider>
  );
}
