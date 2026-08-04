"use client";

import * as React from "react";
import Link from "next/link";
import { Logo } from "../ui/Logo";
import { Button } from "../ui/Button";
import { Icon } from "../icons/Icon";
import { actionLinks, primaryNav } from "@/lib/site";

/**
 * Sticky transparent header that turns into a solid, blurred navbar on scroll.
 * Pure client component so we can listen to the scroll position.
 *
 * Matches the reference design: transparent on dark hero, becomes
 * glassy white when scrolled past it.
 */
export function Header() {
    const [scrolled, setScrolled] = React.useState(false);
    const [mobileOpen, setMobileOpen] = React.useState(false);

    React.useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <header
            className={[
                "fixed inset-x-0 top-0 z-50 transition-all duration-300",
                scrolled ? "py-2" : "py-4",
            ].join(" ")}
        >
            <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
                <div
                    className={[
                        "flex h-14 w-full items-center justify-between gap-6 rounded-2xl border px-3 transition-all duration-300 sm:px-5",
                        scrolled
                            ? "border-border-card bg-white/85 shadow-card backdrop-blur-xl"
                            : "border-transparent bg-transparent",
                    ].join(" ")}
                >
                    <Link
                        href="#top"
                        aria-label="Havena home"
                        className="shrink-0"
                    >
                        <Logo tone={scrolled ? "brand" : "light"} />
                    </Link>

                    <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
                        {primaryNav.map((item, idx) => {
                            const isActive = idx === 0;
                            return (
                                <a
                                    key={item.href}
                                    href={item.href}
                                    className={[
                                        // Base + smooth color transition for the scroll swap.
                                        "rounded-full px-3.5 py-1.5 text-sm font-medium",
                                        "transition-colors duration-300 ease-out",
                                        scrolled
                                            ? "text-brand-deep hover:bg-brand-soft"
                                            : isActive
                                                ? "text-white"
                                                : "text-white/80 hover:text-white",
                                    ].join(" ")}
                                    style={
                                        isActive
                                            ? {
                                                borderBottom: scrolled
                                                    ? "2px solid #14B8A6" // brand-deep
                                                    : "2px solid #14B8A6", // brand-end (light purple)
                                                borderRadius: 0,
                                                paddingBottom: "4px",
                                                transition: "border-color 300ms ease-out",
                                            }
                                            : undefined
                                    }
                                >
                                    {item.label}
                                </a>
                            );
                        })}
                    </nav>

                    <div className="flex items-center gap-2">
                        <Button
                            href={actionLinks.login}
                            variant={scrolled ? "primary" : "white"}
                            size="sm"
                            className="hidden sm:inline-flex"
                        >
                            Login
                        </Button>
                        <Button
                            href={actionLinks.signUp}
                            variant={scrolled ? "primary" : "white"}
                            size="sm"
                            className="hidden sm:inline-flex"
                            iconTrailing="arrow-right"
                        >
                            Get Started
                        </Button>

                        <button
                            type="button"
                            onClick={() => setMobileOpen((s) => !s)}
                            aria-label={mobileOpen ? "Close menu" : "Open menu"}
                            aria-expanded={mobileOpen}
                            className={[
                                "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors duration-300 ease-out lg:hidden",
                                scrolled
                                    ? "border-border-card text-brand-deep hover:bg-brand-soft"
                                    : "border-white/30 text-white hover:bg-white/10",
                            ].join(" ")}
                        >
                            <Icon
                                name={mobileOpen ? "close" : "menu"}
                                className="h-4 w-4"
                            />
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div className="mx-4 mt-2 overflow-hidden rounded-2xl border border-border-card bg-white/95 shadow-elevated backdrop-blur-xl sm:mx-6 lg:hidden">
                    <div className="flex w-full flex-col gap-1 px-3 py-3">
                        {primaryNav.map((item) => (
                            <a
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink-body transition-colors hover:bg-surface-muted hover:text-ink-primary"
                            >
                                {item.label}
                            </a>
                        ))}
                        <div className="mt-2 flex flex-col gap-2 border-t border-border-subtle pt-3">
                            <Button
                                href={actionLinks.login}
                                variant="primary"
                                size="md"
                                fullWidth
                            >
                                Login
                            </Button>
                            <Button
                                href={actionLinks.signUp}
                                variant="primary"
                                size="md"
                                iconTrailing="arrow-right"
                                fullWidth
                            >
                                Get Started
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}

export default Header;
