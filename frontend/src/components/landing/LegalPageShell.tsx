import Link from "next/link";
import { Container } from "@/components/landing/ui/Container";
import { Logo } from "@/components/landing/ui/Logo";
import { Footer } from "@/components/landing/sections/Footer";
import { Icon } from "@/components/landing/icons/Icon";
import type { LegalDocument } from "@/lib/landing/legal-content";
import { LandingSectionLink } from "@/components/landing/ui/LandingSectionLink";

type LegalPageShellProps = {
  document: LegalDocument;
};

export function LegalPageShell({ document }: LegalPageShellProps) {
  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-white text-ink-primary antialiased">
      <header className="sticky top-0 z-40 border-b border-border-card bg-white/90 backdrop-blur-md">
        <Container size="xl" className="flex h-16 items-center justify-between gap-4">
          <Link href="/" aria-label="NeighborLink home" className="shrink-0">
            <Logo tone="brand" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-body transition-colors hover:text-brand-deep"
          >
            <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
            Back to home
          </Link>
        </Container>
      </header>

      <main id="main" className="relative">
        <div aria-hidden="true" className="soft-section absolute inset-0 -z-10" />
        <div
          aria-hidden="true"
          className="grid-mask-light pointer-events-none absolute inset-0 -z-10 opacity-40"
        />

        <Container size="md" className="relative py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-3xl">
            <p className="section-label">Legal</p>
            <h1 className="page-title mt-3">{document.title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-body">{document.description}</p>
            <p className="mt-2 text-[13px] font-medium text-ink-muted">
              Last updated: {document.lastUpdated}
            </p>

            <nav
              aria-label="Table of contents"
              className="legal-toc mt-10 rounded-2xl border border-border-card bg-white/80 p-5 shadow-card backdrop-blur-sm"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-deep">
                On this page
              </p>
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                {document.sections.map((section, index) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="legal-toc-link">
                      <span className="text-ink-muted">{String(index + 1).padStart(2, "0")}</span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <article className="legal-body mt-10 space-y-10">
              {document.sections.map((section) => (
                <section key={section.id} id={section.id} className="legal-section scroll-mt-28">
                  <h2 className="text-[20px] font-bold tracking-tight text-ink-primary sm:text-[22px]">
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph} className="text-[15px] leading-[1.75] text-ink-body">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets?.length ? (
                      <ul className="space-y-2.5 pl-1">
                        {section.bullets.map((item) => (
                          <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-ink-body">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-deep" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ))}
            </article>

            <div className="legal-footer-note mt-12 rounded-2xl border border-border-card bg-brand-soft/60 px-5 py-4 text-[14px] text-ink-body">
              Questions?{" "}
              <LandingSectionLink sectionId="contact" className="font-semibold text-brand-deep hover:underline">
                Contact us
              </LandingSectionLink>{" "}
              or return to the{" "}
              <Link href="/" className="font-semibold text-brand-deep hover:underline">
                homepage
              </Link>
              .
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}

export default LegalPageShell;
