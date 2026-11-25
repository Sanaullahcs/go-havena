import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { ctaCopy, quotesCopy, trustCopy, trustFeatures } from "@/lib/marketing/content";
import { Reveal } from "@/components/marketing/reveal";
import { QuotesCarousel } from "@/components/marketing/quotes-carousel";

export function MarketingTrustSection() {
  return (
    <section id="trust" className="lp-trust">
      <div className="lp-container lp-trust__grid">
        <Reveal className="lp-trust__copy">
          <p className="lp-trust__eyebrow">
            <span className="lp-trust__eyebrow-line" aria-hidden />
            {trustCopy.eyebrow}
          </p>
          <h2 className="lp-trust__title">
            {trustCopy.titleLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
          <p className="lp-trust__lead">{trustCopy.lead}</p>
          <ul className="lp-trust__list">
            {trustFeatures.map((item, index) => (
              <Reveal key={item} delay={120 + index * 70}>
                <li>
                  <span className="lp-trust__check" aria-hidden>
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  {item}
                </li>
              </Reveal>
            ))}
          </ul>
        </Reveal>

        <Reveal className="lp-trust__visual lp-reveal--scale" delay={120}>
          <div className="lp-trust__shield-wrap">
            <div className="lp-trust__shield-glow" aria-hidden />
            <ShieldCheck className="lp-trust__shield" strokeWidth={1.5} aria-hidden />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function MarketingTestimonials() {
  return (
    <section id="company" className="lp-quotes">
      <div className="lp-container">
        <Reveal className="lp-quotes__header">
          <p className="lp-eyebrow">{quotesCopy.eyebrow}</p>
          <h2 className="lp-quotes__title lp-section-headline">
            {quotesCopy.titleLines.map((line, index) => (
              <span key={line} className={index === 1 ? "lp-section-accent" : undefined}>
                {line}
              </span>
            ))}
          </h2>
          <p className="lp-quotes__lead">{quotesCopy.lead}</p>
        </Reveal>

        <QuotesCarousel />
      </div>
    </section>
  );
}

export function MarketingCtaBanner() {
  return (
    <section className="lp-cta">
      <div className="lp-container">
        <Reveal className="lp-cta-banner lp-reveal--scale">
          <div className="lp-cta-banner__glow lp-parallax-decor" data-depth="12" aria-hidden />
          <div className="lp-cta-banner__main">
            <p className="lp-cta-banner__eyebrow">{ctaCopy.eyebrow}</p>
            <h2>
              {ctaCopy.titleLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <p>{ctaCopy.lead}</p>
          </div>
          <aside className="lp-cta-banner__aside">
            <p className="lp-cta-banner__aside-kicker">A written conversation</p>
            <p>Share a little about the community. We’ll come back with a time to talk.</p>
            <Link href="/request-demo" className="lp-btn-primary lp-cta-banner__btn">
              {ctaCopy.button}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </aside>
          <ol className="lp-cta-banner__steps">
            {ctaCopy.steps.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step.title}</strong>
                <em>{step.detail}</em>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
