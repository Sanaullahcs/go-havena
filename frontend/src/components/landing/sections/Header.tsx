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

      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        syncActiveSection();
        rafRef.current = null;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", syncActiveSection, { passive: true });
    window.addEventListener(LANDING_SCROLL_SYNC_EVENT, syncActiveSection);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", syncActiveSection);
      window.removeEventListener(LANDING_SCROLL_SYNC_EVENT, syncActiveSection);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [syncActiveSection]);

  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.removeProperty("overflow");
    };
  }, [mobileOpen]);

  const solid = scrolled || mobileOpen;

  return (
    <header className={["lp-header", solid ? "is-scrolled" : ""].filter(Boolean).join(" ")}>
      <div className="lp-header__inner">
        <LandingHomeLink
          className="lp-header__brand"
          onNavigate={() => {
            setActiveSection("");
            setMobileOpen(false);
          }}
        >
          <Logo tone="brand" />
        </LandingHomeLink>

        <nav aria-label="Primary" className="lp-header__nav hidden lg:flex">
          {primaryNav.map((item) => {
            if (!item.sectionId) return null;
            const isActive = activeSection === item.sectionId;
            return (
              <LandingSectionLink
                key={item.sectionId}
                sectionId={item.sectionId}
                onNavigate={() => {
                  setActiveSection(item.sectionId!);
                  setMobileOpen(false);
                }}
                className={["lp-nav-link", isActive ? "is-active" : ""].filter(Boolean).join(" ")}
              >
                {item.label}
              </LandingSectionLink>
            );
          })}
        </nav>

        <div className="lp-header__actions">
          <div className="lp-header__cta-group hidden items-center gap-3 sm:flex">
            <Button href={actionLinks.login} variant="ghost" size="sm" className="lp-header__login">
              Log in
            </Button>
            <Button href={actionLinks.signUp} variant="primary" size="sm" className="lp-header__start">
              Sign up
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((s) => !s)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="lp-header__menu-btn lg:hidden"
          >
            <Icon name={mobileOpen ? "close" : "menu"} className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="lp-mobile-backdrop lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="lp-mobile-menu lg:hidden">
            <nav className="flex flex-col gap-0.5 px-4 py-4" aria-label="Mobile">
              {primaryNav.map((item) => {
                if (!item.sectionId) return null;
                return (
                  <LandingSectionLink
                    key={item.sectionId}
                    sectionId={item.sectionId}
                    onNavigate={() => {
                      setActiveSection(item.sectionId!);
                      setMobileOpen(false);
                    }}
                    className={[
                      "lp-mobile-link",
                      activeSection === item.sectionId ? "is-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {item.label}
                  </LandingSectionLink>
                );
              })}
            </nav>
            <div className="flex flex-col gap-2 border-t border-border-subtle px-4 py-4">
              <Button href={actionLinks.login} variant="secondary" size="md" fullWidth>
                Log in
              </Button>
              <Button href={actionLinks.signUp} variant="primary" size="md" fullWidth>
                Sign up
              </Button>
              <Button href={actionLinks.residentLogin} variant="ghost" size="md" fullWidth>
                Resident portal
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}

export default Header;
