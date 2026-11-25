"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { HavenaLockup } from "@/components/shared/havena-lockup";
import { MarketingNavLink } from "@/components/marketing/nav-link";
import { navLinks } from "@/lib/marketing/content";

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia("(min-width: 768px)").matches) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = () => setOpen(false);

  return (
    <header
      className={`lp-header sticky top-0 z-50 border-b bg-white/90 backdrop-blur-md ${
        scrolled ? "is-scrolled" : ""
      }`}
    >
      <div className="lp-container flex h-[3.25rem] items-center justify-between gap-3 sm:h-[4rem] sm:gap-4 lg:h-[4.5rem]">
        <Link
          href="/"
          className="lp-header__brand flex min-w-0 items-center gap-2"
          onClick={closeMenu}
        >
          <HavenaLockup size={36} nameClassName="lp-brand-name" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <MarketingNavLink key={link.label} href={link.href} className="lp-nav-link">
              {link.label}
            </MarketingNavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/request-demo"
            className="lp-header__demo-link text-[0.9375rem] font-medium text-[var(--lp-gray-600)] hover:text-[var(--lp-blue)]"
          >
            Request a demo
          </Link>
          <Link
            href="/register"
            className="lp-btn-primary lp-header__cta px-4 py-2 text-[0.875rem]"
          >
            Get started
          </Link>
          <button
            type="button"
            className="lp-header__menu-btn inline-flex md:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open ? (
        <>
          <div id={menuId} className="lp-header__drawer md:hidden">
            <nav className="lp-header__drawer-nav" aria-label="Mobile">
              {navLinks.map((link) => (
                <MarketingNavLink
                  key={link.label}
                  href={link.href}
                  className="lp-header__drawer-link"
                  onNavigate={closeMenu}
                >
                  {link.label}
                </MarketingNavLink>
              ))}
            </nav>
            <div className="lp-header__drawer-actions">
              <Link href="/request-demo" className="lp-header__drawer-link" onClick={closeMenu}>
                Request a demo
              </Link>
              <Link href="/register" className="lp-btn-primary w-full" onClick={closeMenu}>
                Get started
              </Link>
            </div>
          </div>
          <button
            type="button"
            className="lp-header__backdrop md:hidden"
            aria-label="Close menu"
            onClick={closeMenu}
          />
        </>
      ) : null}
    </header>
  );
}

export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="lp-btn-secondary">
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}
