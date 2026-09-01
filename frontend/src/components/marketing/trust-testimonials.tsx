import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { testimonials, trustFeatures } from "@/lib/marketing/content";
import { Reveal } from "@/components/marketing/reveal";

export function MarketingTrustSection() {
  return (
    <section id="trust" className="lp-trust">
      <div className="lp-container lp-trust__grid">
        <Reveal className="lp-trust__copy">
          <p className="lp-trust__eyebrow">
            <span className="lp-trust__eyebrow-line" aria-hidden />
            Trust is core of the product
          </p>
          <h2 className="lp-trust__title">Built to feel safe enough to be useful.</h2>
          <p className="lp-trust__lead">
            Community works when people trust the space. Havena puts privacy, safety, clear
            moderation, and healthy engagement controls at the center of the experience.
          </p>
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

const testimonialAvatars = [
  "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=96&h=96&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&h=96&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=96&h=96&q=80",
];

export function MarketingTestimonials() {
  return (
    <section id="company" className="lp-quotes">
      <div className="lp-container">
        <Reveal className="lp-quotes__header">
          <p className="lp-eyebrow">What community leaders want</p>
          <h2 className="lp-h2 mt-3">Less software to manage. More community to build.</h2>
        </Reveal>

        <div className="lp-quotes__grid">
          <Reveal as="blockquote" className="lp-quotes__featured" delay={80}>
            <p>&ldquo;{testimonials.featured.quote}&rdquo;</p>
            <footer>
              <img src={testimonialAvatars[0]} alt="" width={40} height={40} />
              <div>
                <strong>Jordan Hale</strong>
                <span>{testimonials.featured.role}</span>
              </div>
            </footer>
          </Reveal>

          <div className="lp-quotes__stack">
            {testimonials.cards.map((item, index) => (
              <Reveal
                key={item.role}
                as="blockquote"
                className={`lp-quotes__card lp-quotes__card--${index === 0 ? "mint" : "sky"}`}
                delay={140 + index * 80}
              >
                <p>&ldquo;{item.quote}&rdquo;</p>
                <footer>
                  <img src={testimonialAvatars[index + 1]} alt="" width={36} height={36} />
                  <div>
                    <strong>{index === 0 ? "Priya Shah" : "Chris Nguyen"}</strong>
                    <span>{item.role}</span>
                  </div>
                </footer>
              </Reveal>
            ))}
          </div>
        </div>
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
            <h2>Give your community a place that feels like theirs.</h2>
            <p>
              Start with 100 people or scale to 100,000. Havena keeps the experience calm, focused,
              and beautifully yours.
            </p>
          </div>
          <Link href="/request-demo" className="lp-btn-white lp-cta-banner__btn">
            Request a demo
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
