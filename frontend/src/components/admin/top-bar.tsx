"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, CircleHelp, LogOut, Menu, UserRound } from "lucide-react";
import { clearSession, getUser, isSystemAdminUser } from "@/lib/auth/session";
import { NotificationBell, type AppNotification } from "@/components/shared/notification-bell";
import { UserAvatar } from "@/components/admin/user-avatar";
import { confirmAction } from "@/lib/alert";
import { logout } from "@/lib/api/auth";
import { NL } from "@/lib/design-tokens";

const ADMIN_NOTIFICATIONS: AppNotification[] = [
  { id: 1, type: "warning", title: "New moderation report", body: "James Okafor filed a noise complaint for Apt 3C.", time: "2m ago", read: false },
  { id: 2, type: "success", title: "Membership approved", body: "Sarah Mitchell's membership request was auto-approved.", time: "15m ago", read: false },
  { id: 3, type: "message", title: "New message", body: "Lisa Wang: 'Can I reschedule my maintenance appointment?'", time: "1h ago", read: false },
  { id: 4, type: "info", title: "Marketplace listing posted", body: "David Chen posted a new item in the marketplace.", time: "2h ago", read: true },
  { id: 5, type: "system", title: "System update", body: "Havena v2.1.4 deployed successfully.", time: "Yesterday", read: true },
  { id: 6, type: "warning", title: "Lease expiring soon", body: "3 residents have leases expiring within 30 days.", time: "Yesterday", read: true },
];

export function AdminTopBar({
  title,
  onMenuOpen,
}: {
  title: string;
  onMenuOpen: () => void;
}) {
  const router = useRouter();
  const [dateStr, setDateStr] = useState("");
  const [open, setOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<ReturnType<typeof getUser>>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionUser(getUser());
    const onSessionUpdate = () => setSessionUser(getUser());
    window.addEventListener("nbr-session-updated", onSessionUpdate);
    return () => window.removeEventListener("nbr-session-updated", onSessionUpdate);
  }, []);

  const user = sessionUser ?? getUser();
  const showHelpSupport = !isSystemAdminUser(user);

  useEffect(() => {
    const d = new Date();
    setDateStr(d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
  }, []);

  /* close on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayName =
    user?.name || user?.profile?.display_name || user?.email?.split("@")[0] || "Admin";
  const email = user?.email || "admin@havena.app";
  const avatarUrl = user?.profile?.avatar_url ?? user?.profile?.avatar ?? null;

  const handleLogout = async () => {
    setOpen(false);
    const result = await confirmAction({
      title: "Sign out?",
      text: "You will be returned to the login screen.",
      confirmText: "Sign out",
      icon: "question",
      color: "red",
    });
    if (result.isConfirmed) {
      await logout();
      clearSession();
      router.replace("/login");
    }
  };

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-[#EDEDED]/80 bg-[#F8FAFC]/95 backdrop-blur-sm">
      <div className="relative mx-auto w-full max-w-[1680px] px-4 sm:px-5 lg:px-6">
        <div className="flex min-h-[52px] items-center gap-3 py-1.5 sm:gap-4">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={onMenuOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white hover:text-[#007BFF] md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" strokeWidth={2} />
          </button>

          {/* Page title */}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900 sm:text-[17px]">
            {title}
          </h1>

          {/* Right cluster */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {dateStr && (
              <div className="hidden rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 sm:block">
                {dateStr}
              </div>
            )}

            <span className="hidden h-7 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />

            {/* Notification bell */}
            <NotificationBell notifications={ADMIN_NOTIFICATIONS} accentColor={NL.brandPrimary} viewAllHref="/admin/notifications" />

            {/* Avatar + dropdown */}
            <div ref={dropRef} className="relative">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="Account menu"
                className={`rounded-full transition ${open ? "ring-2 ring-[#007BFF]/40" : "ring-2 ring-transparent"}`}
              >
                <UserAvatar
                  name={displayName}
                  src={avatarUrl}
                  size={32}
                  className="shadow-sm ring-2 ring-white"
                  color={NL.brandPrimaryDeep}
                />
              </button>

              {/* Dropdown panel */}
              <div
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 origin-top-right"
                style={{
                  transform: open ? "scale(1) translateY(0)" : "scale(0.95) translateY(-6px)",
                  opacity: open ? 1 : 0,
                  pointerEvents: open ? "auto" : "none",
                  transition: "transform 180ms cubic-bezier(0.16,1,0.3,1), opacity 160ms ease",
                }}
              >
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10">
                  {/* User info header */}
                  <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
                    <UserAvatar
                      name={displayName}
                      src={avatarUrl}
                      size={36}
                      className="shadow-sm ring-2 ring-white"
                      color={NL.brandPrimaryDeep}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-900">{displayName}</p>
                      <p className="truncate text-[11px] text-slate-400">{email}</p>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="space-y-0.5 p-1.5">
                    <Link
                      href="/admin/profile"
                      onClick={() => setOpen(false)}
                      className="group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-[#EFF6FF] hover:text-[#0052DF]"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-[#EFF6FF] group-hover:text-[#007BFF]">
                        <UserRound className="h-4 w-4" strokeWidth={2} />
                      </span>
                      My Profile
                    </Link>

                    <Link
                      href="/admin/notifications"
                      onClick={() => setOpen(false)}
                      className="group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-[#EFF6FF] hover:text-[#0052DF]"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-[#EFF6FF] group-hover:text-[#007BFF]">
                        <Bell className="h-4 w-4" strokeWidth={2} />
                      </span>
                      Notifications
                    </Link>

                    {showHelpSupport ? (
                    <Link
                      href="/admin/support"
                      onClick={() => setOpen(false)}
                      className="group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-[#EFF6FF] hover:text-[#0052DF]"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-[#EFF6FF] group-hover:text-[#007BFF]">
                        <CircleHelp className="h-4 w-4" strokeWidth={2} />
                      </span>
                      Help &amp; Support
                    </Link>
                    ) : null}
                  </div>

                  {/* Divider + sign out */}
                  <div className="border-t border-slate-100 p-1.5">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-700"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-rose-100 group-hover:text-rose-600">
                        <LogOut className="h-4 w-4" strokeWidth={2} />
                      </span>
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
