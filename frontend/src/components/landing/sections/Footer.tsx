import Link from "next/link";
import { LandingSectionLink } from "../ui/LandingSectionLink";
import { Container } from "../ui/Container";
import { Logo } from "../ui/Logo";
import { Icon } from "../icons/Icon";
import { actionLinks, footerColumns, site, socialLinks } from "@/lib/landing/site";

const FOOTER_PILLS = [
  { icon: "shield-check" as const, label: "Verified access" },
  { icon: "phone" as const, label: "Mobile + web" },
  { icon: "zap" as const, label: "Live in minutes" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="landing-footer relative overflow-hidden">
      <div aria-hidden="true" className="landing-footer-topline" />
      <div aria-hidden="true" className="grid-mask-light pointer-events-none absolute inset-0 opacity-25" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 top-0 h-56 w-56 rounded-full bg-[#0052df]/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-[#0179ff]/8 blur-3xl"
      />

      <Container size="xl" className="relative">
        <div className="landing-footer-main py-14 sm:py-16 lg:py-[4.5rem]">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-10 xl:gap-14">
            <div className="lg:col-span-5 xl:col-span-4">
              <Logo tone="dark" />
              <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-ink-body">
                Connecting neighborhoods with a calm, modern platform for events, updates, wellness, and
                everyday community life.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {FOOTER_PILLS.map((pill) => (
                  <span
                    key={pill.label}
                    className="landing-footer-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-ink-body"
                  >
                    <Icon name={pill.icon} className="h-3 w-3 text-brand-deep" />
                    {pill.label}
                  </span>
                ))}
              </div>

              <Link href={actionLinks.signUp} className="landing-footer-cta group mt-7 inline-flex">
                <span>Start free</span>
                <Icon
                  name="arrow-right"
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </Link>
            </div>

            <nav
              className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7 xl:col-span-8 lg:gap-10 xl:pl-6"
              aria-label="Footer"
            >
              {footerColumns.map((col) => (
                <div key={col.title}>
                  <h3 className="landing-footer-heading">{col.title}</h3>
                  <ul className="mt-4 space-y-2">
                    {col.links.map((link) => (
                      <li key={link.label}>
                        {link.sectionId ? (
                          <LandingSectionLink sectionId={link.sectionId} className="landing-footer-link">
                            {link.label}
                          </LandingSectionLink>
                        ) : (
                          <Link href={link.href ?? "#"} className="landing-footer-link">
                            {link.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
        </div>

        <div className="landing-footer-bar flex flex-col items-center gap-5 pb-6 pt-0 sm:flex-row sm:justify-between">
          <p className="text-center text-[12px] text-ink-muted sm:text-left">
            © {year} {site.name}. All rights reserved.
          </p>

          <ul className="flex items-center gap-2">
            {socialLinks.map((s) => (
              <li key={s.name}>
                <a href={s.href} aria-label={s.label} className="landing-footer-social">
                  <Icon name={s.name as never} className="h-3.5 w-3.5" />
                </a>
              </li>
            ))}
          </ul>

          <p className="text-center text-[12px] text-ink-muted sm:text-right">
            Built for modern community living.
          </p>
        </div>
      </Container>
    </footer>
  );
}

export default Footer;
