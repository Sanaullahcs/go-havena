"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser } from "@/lib/auth/session";
import { fetchMessageUnreadCount } from "@/lib/api/messages";
import { HavenaMark } from "@/components/shared/havena-mark";

/* ─── Nav icons (must be defined before nav config) ─── */

function NavIconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function NavIconMembers() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 13c0-2.21 1.79-4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9 13c0-1.657 1.12-3 2.5-3s2.5 1.343 2.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function NavIconNotices() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 5.5h7M4.5 8h7M4.5 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function NavIconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="3" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 6.5h11M5.5 2v2M10.5 2v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function NavIconAlert() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2.5l5.5 9.5H2.5L8 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function NavIconFeed() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 4.5h11M2.5 8h8M2.5 11.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function NavIconRegions() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 4.5h11v7h-11z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 7.5h6M5 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function NavIconCommunity() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 7.5L8 3.5l5.5 4v5h-11v-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.5 12.5V9h3v3.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function NavIconResidents() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 13c0-2.2 2-3.5 4.5-3.5s4.5 1.3 4.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function NavIconMarket() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 6h10l-.8 7H3.8L3 6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5.5 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function NavIconStore() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 7l6-4 6 4v6.5a1 1 0 01-1 1H3a1 1 0 01-1-1V7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 14.5V9h4v5.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function NavIconActivity() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M1.5 8h2.5l2-5 2.5 8.5L11 5.5l1.5 3.5H14.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavIconWellness() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2.5l1.2 3.6h3.8l-3.1 2.2 1.2 3.6L8 9.7 4.9 11.9l1.2-3.6-3.1-2.2h3.8L8 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function NavIconDocuments() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4.5 2.5h4.5l3 3v8.5a1 1 0 01-1 1h-6.5a1 1 0 01-1-1v-10.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9 2.5v3h3M5.5 8h5M5.5 10.5h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function NavIconAmenity() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 7l5-4 5 4v6.5a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.5 14.5V9h3v5.5M7 5.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function NavIconRules() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5.5h6M5 8h4M7.5 10.5H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="11" cy="11" r="2" fill="currentColor" opacity="0.25" />
      <path d="M10 11l.8.8 1.4-1.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavIconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 5.5l6 4 6-4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function NavIconBilling() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="4" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 7h12M5 10.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function NavIconMessages() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M14 2H2a1 1 0 00-1 1v8a1 1 0 001 1h2v2.5L7.5 12H14a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4.5 6.5h7M4.5 8.5h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Nav config ─── */

type NavItem = {
  href: string;
  label: string;
  icon: () => React.ReactNode;
  badge?: number;
};

const overviewNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: NavIconGrid },
];

const systemAdminNav: NavItem[] = [
  { href: "/admin/community-admins", label: "Community Admins", icon: NavIconMembers },
  { href: "/admin/residents", label: "Residents", icon: NavIconResidents },
  { href: "/admin/communities", label: "Community Requests", icon: NavIconCommunity },
  { href: "/admin/regions", label: "Regions", icon: NavIconRegions },
  { href: "/admin/contact-messages", label: "Contact Messages", icon: NavIconMail },
  { href: "/admin/wellness", label: "Wellness Programs", icon: NavIconWellness },
];

const communityAdminNav: NavItem[] = [
  { href: "/admin/members", label: "Members", icon: NavIconMembers },
  { href: "/admin/billing", label: "Billing", icon: NavIconBilling },
  { href: "/admin/guests", label: "Guest Users", icon: NavIconMembers },
  { href: "/admin/messages", label: "Messages", icon: NavIconMessages },
  { href: "/admin/notices", label: "Notices", icon: NavIconNotices },
  { href: "/admin/events", label: "Events", icon: NavIconCalendar },
  { href: "/admin/alerts", label: "Alerts", icon: NavIconAlert },
  { href: "/admin/community-rules", label: "Community Rules", icon: NavIconRules },
  { href: "/admin/documents", label: "Documents", icon: NavIconDocuments },
  { href: "/admin/amenities", label: "Amenities", icon: NavIconAmenity },
  { href: "/admin/bookings", label: "Booking Request", icon: NavIconAmenity },
  { href: "/admin/feed", label: "Feed Moderation", icon: NavIconFeed },
  { href: "/admin/marketplace", label: "Marketplace", icon: NavIconMarket },
  { href: "/admin/businesses", label: "Businesses", icon: NavIconStore },
];

const insightsNav: NavItem[] = [
  { href: "/admin/activity", label: "Activity Logs", icon: NavIconActivity },
];

/* ─── NavSection ─── */

function NavSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  return (
    <div className="space-y-0.5">
      {title && (
        <p className="flex items-center gap-2 px-2 pb-1.5 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          {title}
          <span className="h-px flex-1 bg-slate-100" aria-hidden />
        </p>
      )}
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            onMouseEnter={() => router.prefetch(item.href)}
            onFocus={() => router.prefetch(item.href)}
            onClick={onNavigate}
            className={[
              "group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors duration-150",
              active
                ? "text-white shadow-md"
                : "text-slate-600 hover:bg-[#E8F0F7] hover:text-[#0B1C2E]",
            ].join(" ")}
            style={
              active
                ? { background: "#0B1C2E", boxShadow: "0 4px 12px rgba(27, 79, 138, 0.28)" }
                : undefined
            }
          >
            <span
              className={[
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                active
                  ? "bg-white/15 text-white"
                  : "text-slate-400 group-hover:scale-105 group-hover:text-[#1B4F8A]",
              ].join(" ")}
            >
              <Icon />
            </span>
            <span className="truncate">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span
                className={[
                  "ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                  active ? "bg-white text-[#1B4F8A]" : "bg-[#1B4F8A] text-white",
                ].join(" ")}
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            ) : active ? (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/* ─── Brand ─── */

function Brand() {
  return (
    <Link href="/admin" className="nl-sidebar-brand">
      <span className="nl-sidebar-brand-mark nl-sidebar-brand-mark--solid">
        <HavenaMark size={36} />
      </span>
      <span className="flex min-w-0 flex-col justify-center gap-0">
        <span className="nl-sidebar-brand-name">Havena</span>
        <span className="nl-sidebar-brand-role">Admin Portal</span>
      </span>
    </Link>
  );
}

/* ─── SidebarInner ─── */

function SidebarInner({
  pathname,
  onNavigate,
  hideBrand = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  hideBrand?: boolean;
}) {
  const user = getUser();
  const isSystemAdmin = user?.role === "system_admin" || user?.role === "admin";
  const [messageUnread, setMessageUnread] = useState(0);

  useEffect(() => {
    if (isSystemAdmin) return;

    let cancelled = false;

    async function loadUnread() {
      try {
        const count = await fetchMessageUnreadCount();
        if (!cancelled) setMessageUnread(count);
      } catch {
        /* ignore sidebar badge errors */
      }
    }

    loadUnread();
    const timer = window.setInterval(loadUnread, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isSystemAdmin]);

  const communityNav = communityAdminNav.map((item) =>
    item.href === "/admin/messages" ? { ...item, badge: messageUnread } : item,
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {!hideBrand && (
        <div className="mb-2.5 shrink-0 border-b border-slate-100 pb-2.5">
          <Brand />
        </div>
      )}

      <nav className="nl-sidebar-scroll -mr-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-2">
        {isSystemAdmin ? (
          <>
            <NavSection items={overviewNav} pathname={pathname} onNavigate={onNavigate} />
            <NavSection title="User Management" items={systemAdminNav.slice(0, 2)} pathname={pathname} onNavigate={onNavigate} />
            <NavSection title="Platform" items={systemAdminNav.slice(2)} pathname={pathname} onNavigate={onNavigate} />
            <p className="px-2 pt-3 text-[11px] leading-relaxed text-slate-400">
              Manage community admins and residents, review community requests, and configure regions.
            </p>
          </>
        ) : (
          <>
            <NavSection items={overviewNav} pathname={pathname} onNavigate={onNavigate} />
            <NavSection title="Manage" items={communityNav} pathname={pathname} onNavigate={onNavigate} />
            <NavSection title="Logs" items={insightsNav} pathname={pathname} onNavigate={onNavigate} />
            <p className="px-2 pt-3 text-[11px] leading-relaxed text-slate-400">
              Approve residents, publish content, and moderate your community marketplace.
            </p>
          </>
        )}
      </nav>

      {/* Bottom: version badge */}
      <div className="mt-auto shrink-0 border-t border-slate-100 bg-white pt-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
          <p className="text-[11.5px] font-semibold text-slate-700">Havena Admin</p>
          <p className="mt-0.5 text-[11px] text-slate-400">v2.1.4 · support@havena.app</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Public component ─── */

export function AdminSidebar({
  open,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-dvh w-60 flex-col overflow-hidden border-r border-[#EDEDED] bg-white px-3 py-3 md:flex">
        <SidebarInner pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-[17.5rem] flex-col border-r border-slate-200 bg-white px-3 py-4 shadow-2xl">
            <div className="mb-2.5 flex shrink-0 items-center justify-between border-b border-slate-100 pb-2.5">
              <Brand />
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close menu"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <SidebarInner pathname={pathname} onNavigate={onClose} hideBrand />
          </aside>
        </div>
      )}
    </>
  );
}


