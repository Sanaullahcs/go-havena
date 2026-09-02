import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingNavLink } from "@/components/marketing/nav-link";
import { heroCopy } from "@/lib/marketing/content";

function HeroMockup() {
  return (
    <div className="lp-hero-visual">
      <div className="lp-hero-visual__back" aria-hidden />

      <div className="lp-hero-visual__card lp-hero-visual__card--shot lp-hero-visual__card--phones">
        <img
          src="/marketing/app-phones-hero.png?v=5"
          alt="Havena mobile app screens for community feed, events, home, marketplace, and local deals"
          className="lp-hero-visual__shot lp-hero-visual__shot--phones"
          width={1792}
          height={1008}
        />
      </div>
    </div>
  );
}

export function MarketingHero() {
  return (
    <section className="lp-hero">
      <div className="lp-container">
        <div className="lp-hero__grid">
          <div className="lp-hero__intro">
            <p className="lp-hero__eyebrow">{heroCopy.eyebrow}</p>

            <h1 className="lp-hero__title">
              <span className="lp-hero__title-line">{heroCopy.titleBefore}</span>
              <span className="lp-hero__title-line lp-hero__title-accent">{heroCopy.titleAccent}</span>
            </h1>

            <p className="lp-hero__lead">{heroCopy.lead}</p>
          </div>

          <div className="lp-hero__media">
            <HeroMockup />
          </div>

          <div className="lp-hero__proof">
            <div className="lp-hero__avatars" aria-hidden>
              <img
                className="lp-hero__avatar"
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&h=96&q=80"
                alt=""
                width={36}
                height={36}
              />
              <img
                className="lp-hero__avatar"
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=96&h=96&q=80"
                alt=""
                width={36}
                height={36}
              />
              <img
                className="lp-hero__avatar"
                src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=96&h=96&q=80"
                alt=""
                width={36}
                height={36}
              />
            </div>
            <p>{heroCopy.proof}</p>
          </div>

          <div className="lp-hero__actions">
            <Link href="/register" className="lp-btn-primary lp-hero__cta">
              {heroCopy.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <MarketingNavLink href="/#product" className="lp-hero__link">
              {heroCopy.secondary}
            </MarketingNavLink>
          </div>
        </div>
      </div>
    </section>
  );
}
