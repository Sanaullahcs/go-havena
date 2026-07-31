"use client";

import * as React from "react";
import { Logo } from "../ui/Logo";
import { Button } from "../ui/Button";
import { Icon } from "../icons/Icon";
import { LandingSectionLink } from "../ui/LandingSectionLink";
import { LandingHomeLink } from "../ui/LandingHomeLink";
import { actionLinks, primaryNav } from "@/lib/landing/site";
import { resolveActiveLandingSection, LANDING_SCROLL_SYNC_EVENT } from "@/lib/landing/scroll";

const NAV_SECTION_IDS = primaryNav
  .map((item) => item.sectionId)
  .filter((id): id is string => Boolean(id));

export function Header() {
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<string>("");
  const rafRef = React.useRef<number | null>(null);

  const syncActiveSection = React.useCallback(() => {
    setActiveSection(resolveActiveLandingSection(NAV_SECTION_IDS));
  }, []);

  React.useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        syncActiveSection();
        rafRef.current = null;
      });
    };

    syncActiveSection();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", syncActiveSection, { passive: true });
    window.addEventListener(LANDING_SCROLL_SYNC_EVENT, syncActiveSection);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", syncActiveSection);
      window.removeEventListener(LANDING_SCROLL_SYNC_EVENT, syncActiveSection);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [syncActiveSection]);

  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.removeProperty("overflow");
    }

    return () => {
      document.body.style.removeProperty("overflow");
    };
  }, [mobileOpen]);

  const onLogoClick = () => {
    setActiveSection("");
    setMobileOpen(false);
  };

  const onNavClick = (sectionId: string) => {
    setActiveSection(sectionId);
    setMobileOpen(false);
  };

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 overflow-visible transition-all duration-300",
        scrolled ? "py-2" : "py-3",
      ].join(" ")}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={[
            "landing-header-shell grid min-h-[64px] grid-cols-[1fr_auto] items-center gap-3 rounded-[18px] px-3 transition-all duration-300 sm:px-4 xl:grid-cols-[auto_1fr_auto] xl:gap-4",
            scrolled ? "is-scrolled py-2" : "py-2.5",
          ].join(" ")}
        >
          <LandingHomeLink
            className="shrink-0 justify-self-start xl:col-start-1"
            onNavigate={onLogoClick}
          >
            <Logo tone="brand" />
          </LandingHomeLink>

          <nav
            aria-label="Primary"
            className="landing-nav-tray hidden min-w-0 justify-self-center xl:col-start-2 xl:flex"
          >
            {primaryNav.map((item) => {
              if (!item.sectionId) return null;

              const isActive = activeSection === item.sectionId;

              return (
                <LandingSectionLink
                  key={item.sectionId}
                  sectionId={item.sectionId}
                  onNavigate={() => onNavClick(item.sectionId!)}
                  className={[
                    "landing-nav-link whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition-all duration-200 lg:px-4",
                    isActive ? "is-active" : "",
                  ].join(" ")}
                >
                  {item.label}
                  {item.badge ? (
                    <span className="landing-nav-badge ml-1.5 rounded-full bg-emerald-500 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </LandingSectionLink>
              );
            })}
          </nav>

          <div className="relative z-20 col-start-2 row-start-1 flex items-center justify-end gap-2 sm:gap-2.5 xl:col-start-3">
            <div className="landing-header-actions hidden items-center gap-2 sm:flex">
              <Button href={actionLinks.login} variant="ghost" size="sm" className="landing-btn-ghost">
                Log in
              </Button>
              <Button href={actionLinks.signUp} variant="primary" size="sm" iconTrailing="arrow-right">
                Get started
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((s) => !s)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="landing-mobile-menu"
              className="landing-mobile-toggle relative z-10 inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl border border-border-card bg-white text-brand-deep transition-colors hover:bg-brand-soft xl:hidden"
            >
              <Icon name={mobileOpen ? "close" : "menu"} className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[55] bg-slate-900/25 xl:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div
            id="landing-mobile-menu"
            className="landing-mobile-menu fixed inset-x-4 top-[5.25rem] z-[60] overflow-hidden rounded-[20px] border border-border-card bg-white shadow-elevated sm:inset-x-6 xl:hidden"
          >
          <div className="flex flex-col gap-1 px-3 py-3">
            {primaryNav.map((item) => {
              if (!item.sectionId) return null;

              const isActive = activeSection === item.sectionId;

              return (
                <LandingSectionLink
                  key={item.sectionId}
                  sectionId={item.sectionId}
                  onNavigate={() => onNavClick(item.sectionId!)}
                  className={[
                    "rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-soft text-brand-deep"
                      : "text-ink-body hover:bg-brand-soft/70 hover:text-brand-deep",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center gap-2">
                    {item.label}
                    {item.badge ? (
                      <span className="rounded-full bg-emerald-500 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                </LandingSectionLink>
              );
            })}
            <div className="mt-2 flex flex-col gap-2 border-t border-border-subtle pt-3">
              <Button href={actionLinks.login} variant="secondary" size="md" fullWidth>
                Log in
              </Button>
              <Button href={actionLinks.signUp} variant="primary" size="md" iconTrailing="arrow-right" fullWidth>
                Get started
              </Button>
            </div>
          </div>
          </div>
        </>
      ) : null}
    </header>
  );
}

export default Header;
