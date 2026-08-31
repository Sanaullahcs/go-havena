import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import type { LegalSection } from "@/lib/marketing/legal";

type LegalPageShellProps = {
  title: string;
  updatedAt: string;
  intro: string;
  sections: readonly LegalSection[];
};

export function LegalPageShell({ title, updatedAt, intro, sections }: LegalPageShellProps) {
  return (
    <div className="marketing-landing min-h-screen">
      <MarketingHeader />
      <main className="lp-legal">
        <div className="lp-container lp-legal__layout">
          <aside className="lp-legal__toc" aria-label="On this page">
            <p className="lp-eyebrow">On this page</p>
            <nav>
              <ul>
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.title}</a>
                  </li>
                ))}
              </ul>
            </nav>
            <Link href="/" className="lp-legal__back">
              ← Back to home
            </Link>
          </aside>

          <article className="lp-legal__content">
            <p className="lp-eyebrow">Legal</p>
            <h1 className="lp-h2 mt-3">{title}</h1>
            <p className="lp-legal__updated">Last updated {updatedAt}</p>
            <p className="lp-legal__intro">{intro}</p>

            {sections.map((section) => (
              <section key={section.id} id={section.id} className="lp-legal__section">
                <h2>{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && section.bullets.length > 0 ? (
                  <ul>
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </article>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
