import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingNavLink } from "@/components/marketing/nav-link";
import { trustLogos } from "@/lib/marketing/content";

function HeroMockup() {
  return (
    <div className="lp-hero-visual">
      <div className="lp-hero-visual__back" aria-hidden />

      <div className="lp-hero-visual__card lp-hero-visual__card--shot">
        <span className="lp-hero-visual__shine" aria-hidden />
        <img
          src="/marketing/dashboard-hero.png?v=6"
          alt="Havena community admin dashboard showing member growth, membership status, and community metrics"
          className="lp-hero-visual__shot"
          width={1440}
          height={900}
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
          <div className="lp-hero__copy">
            <p className="lp-hero__eyebrow">A social platform for your community</p>

            <h1 className="lp-hero__title">
              A better place to <span className="lp-hero__title-accent">belong.</span>
            </h1>

            <p className="lp-hero__lead">
              Havena brings people, conversations, events, and trusted resources together in one
              beautifully simple community platform.
            </p>

            <div className="lp-hero__actions">
              <Link href="/register" className="lp-btn-primary lp-hero__cta">
                Bring your community to Havena
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <MarketingNavLink href="/#product" className="lp-hero__link">
                Explore the platform
              </MarketingNavLink>
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
              <p>Trusted by independent creators, organizations, and brands.</p>
            </div>
          </div>

          <div className="lp-hero__media">
            <HeroMockup />
          </div>
        </div>

        <div className="lp-hero__logos" aria-label="Trusted by">
          <div className="lp-hero__logos-label">
            <span>Trusted by</span>
          </div>
          <div className="lp-hero__logos-list">
            {trustLogos.map((name) => (
              <span key={name} className="lp-hero__logo">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
