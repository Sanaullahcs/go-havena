"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, isPakistanCommunityRegion, isSystemAdminUser, SESSION_PATCHED_EVENT } from "@/lib/auth/session";
import { FEATURES_UPDATED_EVENT } from "@/components/auth/feature-settings-sync";
import { adminFeatureForPath, isResidentFeatureEnabled } from "@/lib/resident-features";
import { isPlaidAvailable } from "@/lib/plaid-eligibility";
import { fetchMessageUnreadCount, MESSAGES_UNREAD_EVENT } from "@/lib/api/messages";
import { HavenaMark } from "@/components/shared/havena-mark";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Droplets,
  FileText,
  Home,
  Gift,
  Headset,
  HeartPulse,
  Landmark,
  LifeBuoy,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageSquare,
  Newspaper,
  Scale,
  Settings,
  Smartphone,
  Store,
  Ticket,
  TriangleAlert,
  UserCog,
  Wrench,
  UserPlus,
  Users,
  Wallet,
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
  { href: "/admin/bank-payments", label: "US Bank Payments", icon: Landmark },
  { href: "/admin/kuickpay-oversight", label: "KuickPay Oversight", icon: Wallet },
  { href: "/admin/referrals", label: "Referrals", icon: Gift },
  { href: "/admin/app-version", label: "App Version", icon: Smartphone },
  { href: "/admin/support-complaints", label: "Complaints & Support", icon: Headset },
  { href: "/admin/activity", label: "Activity Logs", icon: Activity },
  { href: "/admin/feature-requests", label: "Feature Requests", icon: Settings },
];

const communityPeopleNav: NavItem[] = [
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/guests", label: "Guest Users", icon: UserPlus },
  { href: "/admin/messages", label: "Messages", icon: MessageSquare },
];

const communityContentNav: NavItem[] = [
  { href: "/admin/notices", label: "Notices", icon: Megaphone },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/alerts", label: "Alerts", icon: TriangleAlert },
  { href: "/admin/community-rules", label: "Community Rules", icon: Scale },
  { href: "/admin/documents", label: "Documents", icon: FileText },
  { href: "/admin/complaints", label: "Complaints", icon: LifeBuoy },
  { href: "/admin/staff", label: "Staff", icon: Wrench },
  { href: "/admin/feed", label: "Feed Moderation", icon: Newspaper },
];

const communityPropertyNav: NavItem[] = [
  { href: "/admin/units", label: "Units", icon: Home },
  { href: "/admin/unit-requests", label: "Unit Requests", icon: ClipboardList },
  { href: "/admin/services", label: "Services", icon: Droplets },
  { href: "/admin/service-bills", label: "Service Bills", icon: CreditCard },
  { href: "/admin/amenities", label: "Amenities", icon: Building2 },
  { href: "/admin/amenity-bills", label: "Amenity Bills", icon: CreditCard },
  { href: "/admin/bookings", label: "Booking Request", icon: CalendarCheck },
];

const communityMarketplaceNav: NavItem[] = [
  { href: "/admin/marketplace", label: "Marketplace", icon: Store },
  { href: "/admin/businesses", label: "Businesses", icon: Store },
];

const communityFinanceNav: NavItem[] = [
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/plaid", label: "Plaid", icon: Landmark },
  { href: "/admin/kuickpay", label: "KuickPay", icon: Wallet },
  { href: "/admin/refer-and-earn", label: "Refer & Earn", icon: Gift },
];

const communityNavGroups: { title: string; items: NavItem[] }[] = [
  { title: "People", items: communityPeopleNav },
  { title: "Community", items: communityContentNav },
  { title: "Property", items: communityPropertyNav },
  { title: "Marketplace", items: communityMarketplaceNav },
  { title: "Finance", items: communityFinanceNav },
];

const communitySettingsNav: NavItem[] = [
  { href: "/admin/feature-settings", label: "Adjust Features", icon: Settings },
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
                ? { background: "#1B4F8A", boxShadow: "0 4px 12px rgba(27, 79, 138, 0.22)" }
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
            <span className="min-w-0 leading-4">{item.label}</span>
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
    window.addEventListener(SESSION_PATCHED_EVENT, syncUser);
    window.addEventListener(FEATURES_UPDATED_EVENT, syncUser);
    window.addEventListener("storage", syncUser);
    return () => {
      window.removeEventListener("nbr-session-updated", syncUser);
      window.removeEventListener(SESSION_PATCHED_EVENT, syncUser);
      window.removeEventListener(FEATURES_UPDATED_EVENT, syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, [pathname]);

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

    const onUnread = (event: Event) => {
      const count = (event as CustomEvent<{ count?: number }>).detail?.count;
      if (typeof count === "number" && !cancelled) setMessageUnread(count);
    };

    loadUnread();
    const timer = window.setInterval(loadUnread, 5_000);
    window.addEventListener(MESSAGES_UNREAD_EVENT, onUnread);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(MESSAGES_UNREAD_EVENT, onUnread);
    };
  }, [isSystemAdmin]);

  const hideReferAndEarn = isPakistanCommunityRegion(user) || !isResidentFeatureEnabled(user?.resident_features, "refer_and_earn");
  const visibleCommunityGroups = communityNavGroups
    .map((group) => ({
      title: group.title,
      items: group.items
        .filter((item) => !(item.href === "/admin/billing" && user?.access?.billing_exempt))
        .filter((item) => !(item.href === "/admin/plaid" && !isPlaidAvailable(user)))
        .filter((item) => !(item.href === "/admin/kuickpay" && !isPakistanCommunityRegion(user)))
        .filter((item) => !(hideReferAndEarn && item.href === "/admin/refer-and-earn"))
        .filter((item) => {
          const path = item.href.split("?")[0] ?? item.href;
          if (path === "/admin/complaints" || path === "/admin/support-complaints") return true;
          const featureKey = adminFeatureForPath(item.href);
          return !featureKey || isResidentFeatureEnabled(user?.resident_features, featureKey);
        })
        .map((item) =>
          item.href === "/admin/messages" ? { ...item, badge: messageUnread } : item,
        ),
    }))
    .filter((group) => group.items.length > 0);

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
            {visibleCommunityGroups.map((group) => (
              <NavSection
                key={group.title}
                title={group.title}
                items={group.items}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
            <NavSection title="Settings" items={communitySettingsNav} pathname={pathname} onNavigate={onNavigate} />
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


