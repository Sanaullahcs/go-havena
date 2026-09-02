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
          <h2 className="lp-trust__title">{trustCopy.title}</h2>
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
            <ShieldCheck className="lp-trust__shield" strokeWidth={1.35} aria-hidden />
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
          <h2 className="lp-h2 mt-3">{quotesCopy.title}</h2>
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
          <div className="lp-cta-banner__glow" aria-hidden />
          <div className="lp-cta-banner__copy">
            <h2>{ctaCopy.title}</h2>
            <p>{ctaCopy.lead}</p>
          </div>
          <Link href="/request-demo" className="lp-btn-white lp-cta-banner__btn">
            {ctaCopy.button}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
