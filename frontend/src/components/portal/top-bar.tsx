"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearSession, getUser } from "@/lib/auth/session";
import { NotificationBell, type AppNotification } from "@/components/shared/notification-bell";
import { resolvePortalNotificationHref } from "@/lib/notifications/resolve-portal-notification-href";
import { confirmAction } from "@/lib/alert";
import { logout } from "@/lib/api/auth";
import { formatAccountContact, formatAccountDisplayName } from "@/lib/user/email-display";

const RESIDENT_NOTIFICATIONS: AppNotification[] = [
  { id: 1, type: "info", title: "Maintenance scheduled", body: "Your kitchen faucet repair is scheduled for today, 2–5 PM.", time: "5m ago", read: false },
  { id: 2, type: "message", title: "New message from Admin", body: "Your maintenance request has been assigned to technician David.", time: "10m ago", read: false },
  { id: 3, type: "success", title: "Community notice posted", body: "June BBQ Meetup — Saturday 4 PM at the courtyard!", time: "1h ago", read: false },
  { id: 4, type: "warning", title: "Lease renewal reminder", body: "Your lease expires in 45 days. Please contact the office to renew.", time: "Yesterday", read: true },
  { id: 5, type: "info", title: "Marketplace listing sold", body: "Your dining table listing received a new inquiry.", time: "2d ago", read: true },
];

export function PortalTopBar({
  title,
  onMenuOpen,
}: {
  title: string;
  onMenuOpen: () => void;
}) {
  const router = useRouter();
  const [dateStr, setDateStr] = useState("");
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const user = getUser();

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

  const displayName = formatAccountDisplayName(user, "Resident");
  const contactLine = formatAccountContact(user);

  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    setOpen(false);
    const r = await confirmAction({
      title: "Sign out?",
      text: "You will be returned to the resident login screen.",
      confirmText: "Sign out",
      icon: "question",
      color: "red",
    });
    if (r.isConfirmed) {
      await logout();
      clearSession();
      router.replace("/resident-login");
    }
  };

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200/70 bg-[#f4f6fb]/95 backdrop-blur-sm">
      <div className="relative mx-auto w-full max-w-[1680px] px-4 sm:px-5 lg:px-6">
        <div className="flex min-h-[52px] items-center gap-3 py-1.5 sm:gap-4">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={onMenuOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white hover:text-emerald-600 md:hidden"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
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
            <NotificationBell
              notifications={RESIDENT_NOTIFICATIONS}
              accentColor="#059669"
              resolveHref={resolvePortalNotificationHref}
            />

            {/* Avatar + dropdown */}
            <div ref={dropRef} className="relative">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="Account menu"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-[12px] font-bold text-white shadow-sm ring-2 ring-transparent transition hover:ring-emerald-300"
              >
                {initials || "R"}
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
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-[13px] font-bold text-white">
                      {initials || "R"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-900">{displayName}</p>
                      {contactLine ? (
                        <p className="truncate text-[11px] text-slate-400">{contactLine}</p>
                      ) : null}
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="p-1.5 space-y-0.5">
                    <Link
                      href="/profile"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700 group"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-emerald-100 group-hover:text-emerald-600">
                        <IcoUser />
                      </span>
                      My Profile
                    </Link>

                    <Link
                      href="/support"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700 group"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-emerald-100 group-hover:text-emerald-600">
                        <IcoSupport />
                      </span>
                      Help &amp; Support
                    </Link>
                  </div>

                  {/* Divider + sign out */}
                  <div className="border-t border-slate-100 p-1.5">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 group"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-rose-100 group-hover:text-rose-600">
                        <IcoLogout />
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

/* ─── Icons ─── */

function IcoUser() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 13.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IcoSupport() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 6.5a1.5 1.5 0 013 .5c0 1-1.5 1.5-1.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}

function IcoLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M10 2H3a1 1 0 00-1 1v10a1 1 0 001 1h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M7 8h7M11 5.5l2.5 2.5L11 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
