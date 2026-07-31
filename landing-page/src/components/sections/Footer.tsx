import * as React from "react";
import Link from "next/link";
import { Container } from "../ui/Container";
import { Logo } from "../ui/Logo";
import { Icon } from "../icons/Icon";
import { footerColumns, site } from "@/lib/site";

/**
 * Full-bleed dark footer.
 *
 * Sits flush against the bottom of the CTA section with no gap and
 * no top border, so the two dark gradient sections read as one
 * continuous band on small/medium screens — exactly like the
 * reference design.
 */
export function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer
            className="relative w-full overflow-hidden text-white"
            style={{
                background:
                    "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
            }}
        >
            {/* Top hairline — barely visible so it doesn't create a visible
          separator between the CTA and the footer. */}
            <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px"
                style={{
                    background:
                        "linear-gradient(to right, transparent, rgba(255,255,255,0.10), transparent)",
                }}
            />

            {/* Aurora glow */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-40 left-1/3 -z-0 h-72 w-72 rounded-full opacity-30 blur-3xl"
                style={{
                    background:
                        "radial-gradient(circle, #6366f1 0%, transparent 70%)",
                }}
            />

            <Container size="xl" className="relative z-10 py-14 lg:py-16">
                <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8">
                    {/* Brand block */}
                    <div className="lg:col-span-4">
                        <Logo />
                        <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-white/70">
                            Connecting neighborhoods.
                            <br />
                            Building stronger communities.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div className="lg:col-span-3">
                        <h3 className="text-[14px] font-bold uppercase tracking-wider text-white">
                            Quick Links
                        </h3>
                        <ul className="mt-4 space-y-2.5">
                            {footerColumns[0].links.map((link) => (
                                <li key={link.label}>
                                    <Link
                                        href={link.href}
                                        className="text-[13.5px] text-white/70 transition-colors hover:text-white"
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Support */}
                    <div className="lg:col-span-3">
                        <h3 className="text-[14px] font-bold uppercase tracking-wider text-white">
                            Support
                        </h3>
                        <ul className="mt-4 space-y-2.5">
                            {footerColumns[1].links.map((link) => (
                                <li key={link.label}>
                                    <Link
                                        href={link.href}
                                        className="text-[13.5px] text-white/70 transition-colors hover:text-white"
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Follow Us */}
                    <div className="lg:col-span-2">
                        <h3 className="text-[14px] font-bold uppercase tracking-wider text-white">
                            Follow Us
                        </h3>
                        <ul className="mt-4 flex items-center gap-2">
                            {[
                                { name: "facebook", label: "Facebook" },
                                { name: "instagram", label: "Instagram" },
                                { name: "twitter", label: "Twitter" },
                                { name: "youtube", label: "YouTube" },
                            ].map((s) => (
                                <li key={s.name}>
                                    <a
                                        href="#"
                                        aria-label={s.label}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/80 transition-all hover:-translate-y-0.5 hover:border-white/40 hover:text-white"
                                    >
                                        <Icon name={s.name as never} className="h-4 w-4" />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Bottom row */}
                <div className="mt-10 border-t border-white/10 pt-6">
                    <p className="text-center text-[12.5px] text-white/60">
                        © 2024 {site.name}. All rights reserved.
                    </p>
                </div>
            </Container>
        </footer>
    );
}

export default Footer;
