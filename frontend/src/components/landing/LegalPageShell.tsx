import Link from "next/link";
import { Container } from "@/components/landing/ui/Container";
import { Logo } from "@/components/landing/ui/Logo";
import { Footer } from "@/components/landing/sections/Footer";
import { Icon } from "@/components/landing/icons/Icon";
import type { LegalDocument } from "@/lib/landing/legal-content";
import { site } from "@/lib/landing/site";

type LegalPageShellProps = {
  document: LegalDocument;
};

export function LegalPageShell({ document }: LegalPageShellProps) {
  return (
    <div className="landing-page lp min-h-screen overflow-x-hidden bg-white text-ink-primary antialiased">
      <header className="lp-legal-header">
        <Container size="xl" className="lp-legal-header__inner">
          <Link href="/" aria-label="Havena home" className="shrink-0">
            <Logo tone="brand" />
          </Link>
          <Link href="/" className="lp-legal-header__back">
            <Icon name="chevron-right" className="h-4 w-4 rotate-180" />
            Back to home
          </Link>
        </Container>
      </header>

      <main id="main" className="lp-legal">
        <Container size="md" className="lp-legal__container">
          <div className="lp-legal__intro">
            <p className="lp-label lp-label--plain">Legal</p>
            <h1 className="lp-legal__title">{document.title}</h1>
            <p className="lp-body lp-legal__description">{document.description}</p>
            <p className="lp-legal__updated">Last updated: {document.lastUpdated}</p>
          </div>

          <nav aria-label="Table of contents" className="lp-legal__toc">
            <p className="lp-legal__toc-label">On this page</p>
            <ol className="lp-legal__toc-list">
              {document.sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="lp-legal__toc-link">
                    <span className="lp-legal__toc-num">{String(index + 1).padStart(2, "0")}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="lp-legal__body">
            {document.sections.map((section) => (
              <section key={section.id} id={section.id} className="lp-legal__section scroll-mt-28">
                <h2 className="lp-legal__section-title">{section.title}</h2>
                <div className="lp-legal__section-content">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="lp-legal__paragraph">
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets?.length ? (
                    <ul className="lp-legal__bullets">
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </section>
            ))}
          </article>

          <div className="lp-legal__note">
            Questions?{" "}
            <a href={`mailto:${site.contactEmail}`} className="lp-legal__note-link">
              Contact us
            </a>{" "}
            or return to the{" "}
            <Link href="/" className="lp-legal__note-link">
              homepage
            </Link>
            .
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}

export default LegalPageShell;
