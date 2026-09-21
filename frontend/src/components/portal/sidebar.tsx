"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HavenaMark } from "@/components/shared/havena-mark";
import { getResidentCommunityName } from "@/lib/auth/session";

type NavItem = {
  href: string;
  label: string;
  icon: () => React.ReactNode;
};

const mainNav: NavItem[] = [
  { href: "/home",        label: "Home",           icon: NavIconHome      },
  { href: "/notices",     label: "Notices",        icon: NavIconNotices   },
  { href: "/feed",        label: "Community Feed", icon: NavIconFeed      },
  { href: "/messages",    label: "Messages",       icon: NavIconMessages  },
  { href: "/wellness",    label: "Wellness",       icon: NavIconWellness  },
  { href: "/marketplace", label: "Marketplace",    icon: NavIconMarket    },
  { href: "/property",    label: "Property",       icon: NavIconProperty  },
];

const accountNav: NavItem[] = [
  { href: "/profile", label: "My Profile", icon: NavIconProfile },
];

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
          item.href === "/home"
            ? pathname === "/home"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={[
              "group relative flex items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors duration-150",
              active
                ? "text-white shadow-md shadow-emerald-600/25"
                : "text-slate-600 hover:bg-emerald-50/60 hover:text-emerald-700",
            ].join(" ")}
            style={
              active
                ? { background: "#1B4F8A" }
                : undefined
            }
          >
            <span
              className={[
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                active
                  ? "bg-white/15 text-white"
                  : "text-slate-400 group-hover:scale-105 group-hover:text-emerald-600",
              ].join(" ")}
            >
              <Icon />
            </span>
            <span className="truncate">{item.label}</span>
            {active && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
            )}
          </Link>
        );
      })}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/home" className="nl-sidebar-brand">
      <span className="nl-sidebar-brand-mark nl-sidebar-brand-mark--solid">
        <HavenaMark size={36} />
      </span>
      <span className="flex min-w-0 flex-col justify-center gap-0">
        <span className="nl-sidebar-brand-name">Havena</span>
        <span className="nl-sidebar-brand-role">Resident Portal</span>
      </span>
    </Link>
  );
}

function SidebarInner({
  pathname,
  onNavigate,
  hideBrand = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  hideBrand?: boolean;
}) {
  const [communityName, setCommunityName] = useState("Your community");

  useEffect(() => {
    const refresh = () => setCommunityName(getResidentCommunityName() || "Your community");
    refresh();
    window.addEventListener("nbr-session-updated", refresh);
    return () => window.removeEventListener("nbr-session-updated", refresh);
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      {!hideBrand && (
        <div className="mb-2.5 shrink-0 border-b border-slate-100 pb-2.5">
          <Brand />
        </div>
      )}

      <nav className="nl-sidebar-scroll -mr-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-2">
        <NavSection items={mainNav} pathname={pathname} onNavigate={onNavigate} />
        <NavSection title="Account" items={accountNav} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="mt-auto shrink-0 border-t border-slate-100 bg-white pt-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
          <p className="truncate text-[11.5px] font-semibold text-slate-700">{communityName}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Havena resident portal</p>
        </div>
      </div>
    </div>
  );
}

export function PortalSidebar({
  open,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-dvh w-60 flex-col overflow-hidden border-r border-slate-200/70 bg-white px-3 py-3 md:flex">
        <SidebarInner pathname={pathname} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <aside className="absolute left-0 top-0 flex h-full w-[17.5rem] flex-col border-r border-slate-200 bg-white px-3 py-4 shadow-2xl">
            <div className="mb-2.5 flex shrink-0 items-center justify-between border-b border-slate-100 pb-2.5">
              <Brand />
              <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
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

function NavIconHome()     { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 7l6-4 6 4v7a1 1 0 01-1 1H3a1 1 0 01-1-1V7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M6 14v-4h4v4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>; }
function NavIconNotices()  { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M4.5 5.5h7M4.5 8h7M4.5 10.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>; }
function NavIconFeed()     { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="5.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" /><path d="M2 13c0-2 1.6-3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><path d="M9 7h5M9 10h4M9 13h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>; }
function NavIconMessages() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M14 2H2a1 1 0 00-1 1v8a1 1 0 001 1h2v2.5L7.5 12H14a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M4.5 6.5h7M4.5 8.5h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>; }
function NavIconWellness() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 13.5C4 11 1.5 8.5 1.5 5.5A3 3 0 017 3.7a3 3 0 015.5 1.8c0 3-2.5 5.5-4.5 8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>; }
function NavIconMarket()   { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M3 6h10l-.8 7H3.8L3 6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M5.5 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>; }
function NavIconProperty() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M2 13V7l4-3 4 3v6H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M10 13V9l3 2v2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M2 13h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>; }
function NavIconProfile()  { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.3" /><path d="M3.5 13c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>; }
