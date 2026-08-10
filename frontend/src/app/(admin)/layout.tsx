"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthShellSkeleton } from "@/components/shared/loaders";
import {
  getToken,
  getUser,
  clearSession,
  updateUser,
  canAccessCommunityDashboard,
  isCommunityAdminUser,
} from "@/lib/auth/session";
import { resolveAdminPortalRedirect } from "@/lib/auth/admin-routes";
import { fetchMe, meToSessionUser } from "@/lib/api/profile";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopBar } from "@/components/admin/top-bar";
import { AdminPushBootstrap } from "@/components/push/admin-push-bootstrap";
import { ForegroundNotificationProvider } from "@/components/push/foreground-notification-provider";

const PAGE_TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/community-admins": "Community Admins",
  "/admin/residents": "Residents",
  "/admin/communities": "Community Requests",
  "/admin/regions": "Regions",
  "/admin/contact-messages": "Contact Messages",
  "/admin/wellness": "Wellness Programs",
  "/admin/members": "Members",
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
  "/admin/support":  "Help & Support",
  "/admin/profile":  "My Profile",
};

function getTitle(pathname: string) {
  return PAGE_TITLES[pathname] ?? "Admin Portal";
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    const user = getUser();
    if (!canAccessCommunityDashboard(user)) {
      if (isCommunityAdminUser(user)) {
        setAccessBlocked(
          user?.community_admin_status === "pending"
            ? "Your community admin account is pending platform approval."
            : "Your account is not linked to an approved community yet.",
        );
        setChecked(true);
        return;
      }
      clearSession();
      router.replace("/login");
      return;
    }

    setAccessBlocked(null);
    setChecked(true);

    // Refresh profile (including avatar URL) so top bar stays in sync.
    void fetchMe()
      .then((me) => updateUser(meToSessionUser(me)))
      .catch(() => {
        // Keep existing session if /me fails (offline / transient).
      });
  }, [router]);

  useEffect(() => {
    if (!checked || accessBlocked) return;

    const user = getUser();
    const redirect = resolveAdminPortalRedirect(pathname, user);
    if (redirect && redirect !== pathname) {
      router.replace(redirect);
    }
  }, [checked, accessBlocked, pathname, router]);

  useEffect(() => {
    document.title = `${getTitle(pathname)} · Havena`;
  }, [pathname]);

  if (!checked) {
    return <AuthShellSkeleton />;
  }

  if (accessBlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F8FB] px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Community admin portal</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Access pending</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{accessBlocked}</p>
          <button
            type="button"
            className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
            onClick={() => {
              clearSession();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const title = getTitle(pathname);

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
