"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, isPakistanCommunityRegion, isSystemAdminUser } from "@/lib/auth/session";
import { isResidentFeatureEnabled } from "@/lib/resident-features";
import { isPlaidAvailable } from "@/lib/plaid-eligibility";
import { fetchMessageUnreadCount } from "@/lib/api/messages";
import { HavenaMark } from "@/components/shared/havena-mark";
import { NL } from "@/lib/design-tokens";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  FileText,
  Gift,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageSquare,
  Newspaper,
  Scale,
  Store,
  Ticket,
  TriangleAlert,
  UserCog,
  UserPlus,
  Users,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

const overviewNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
];

const systemAdminNav: NavItem[] = [
  { href: "/admin/community-admins", label: "Community Admins", icon: UserCog },
  { href: "/admin/residents", label: "Residents", icon: Users },
  { href: "/admin/communities", label: "Community Requests", icon: Building2 },
  { href: "/admin/regions", label: "Regions", icon: MapPin },
  { href: "/admin/request-demo", label: "Request a Demo", icon: CalendarCheck },
  { href: "/admin/wellness", label: "Wellness Programs", icon: HeartPulse },
  { href: "/admin/billing-plans", label: "Billing & Plans", icon: CreditCard },
  { href: "/admin/billing-coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/referrals", label: "Referrals", icon: Gift },
  { href: "/admin/activity", label: "Activity Logs", icon: Activity },
];

const communityAdminNav: NavItem[] = [
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/plaid", label: "Plaid", icon: Landmark },
  { href: "/admin/refer-and-earn", label: "Refer & Earn", icon: Gift },
  { href: "/admin/guests", label: "Guest Users", icon: UserPlus },
  { href: "/admin/messages", label: "Messages", icon: MessageSquare },
  { href: "/admin/notices", label: "Notices", icon: Megaphone },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/alerts", label: "Alerts", icon: TriangleAlert },
  { href: "/admin/community-rules", label: "Community Rules", icon: Scale },
  { href: "/admin/documents", label: "Documents", icon: FileText },
  { href: "/admin/amenities", label: "Amenities", icon: Building2 },
  { href: "/admin/bookings", label: "Booking Request", icon: CalendarCheck },
  { href: "/admin/feed", label: "Feed Moderation", icon: Newspaper },
  { href: "/admin/marketplace", label: "Marketplace", icon: Store },
  { href: "/admin/businesses", label: "Businesses", icon: Store },
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
                : "text-slate-600 hover:bg-[#E8F0F7] hover:text-[#1B4F8A]",
            ].join(" ")}
            style={
              active
                ? { background: NL.fillCta, boxShadow: "0 4px 12px rgba(27, 79, 138, 0.28)" }
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
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
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
  const roleLabel = isSystemAdminUser(getUser()) ? "System Admin" : "Community Admin";

  return (
    <Link href="/admin" className="nl-sidebar-brand">
      <span className="nl-sidebar-brand-mark nl-sidebar-brand-mark--solid">
        <HavenaMark size={40} />
      </span>
      <span className="nl-sidebar-brand-copy">
        <span className="nl-sidebar-brand-name">Havena</span>
        <span className="nl-sidebar-brand-role">{roleLabel}</span>
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
  const [user, setUser] = useState(() => getUser());
  const isSystemAdmin = user?.role === "system_admin" || user?.role === "admin";
  const [messageUnread, setMessageUnread] = useState(0);

  useEffect(() => {
    const syncUser = () => setUser(getUser());
    syncUser();
    window.addEventListener("nbr-session-updated", syncUser);
    window.addEventListener("storage", syncUser);
    return () => {
      window.removeEventListener("nbr-session-updated", syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

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

  const hideReferAndEarn = isPakistanCommunityRegion(user) || !isResidentFeatureEnabled(user?.resident_features, "refer_and_earn");
  const communityNav = communityAdminNav
    .filter((item) => !(item.href === "/admin/billing" && user?.access?.billing_exempt))
    .filter((item) => !(item.href === "/admin/plaid" && !isPlaidAvailable(user)))
    .filter((item) => !(hideReferAndEarn && item.href === "/admin/refer-and-earn"))
    .map((item) =>
      item.href === "/admin/messages" ? { ...item, badge: messageUnread } : item,
    );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {!hideBrand && (
        <div className="mb-1.5 shrink-0 border-b border-slate-100 pb-1.5">
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
              Manage community admins and residents, review community requests, configure regions, and set subscription plans.
            </p>
          </>
        ) : (
          <>
            <NavSection items={overviewNav} pathname={pathname} onNavigate={onNavigate} />
            <NavSection title="Manage" items={communityNav} pathname={pathname} onNavigate={onNavigate} />
            <p className="px-2 pt-3 text-[11px] leading-relaxed text-slate-400">
              Approve residents, publish content, and moderate your community marketplace.
            </p>
          </>
        )}
      </nav>
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
            <div className="mb-1.5 flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 pb-1.5">
              <Brand />
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
            <SidebarInner pathname={pathname} onNavigate={onClose} hideBrand />
          </aside>
        </div>
      )}
    </>
  );
}


