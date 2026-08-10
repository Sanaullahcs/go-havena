import { Button } from "../ui/Button";
import { LandingSectionButton } from "../ui/LandingSectionButton";
import { Container } from "../ui/Container";
import { Icon, type IconName } from "../icons/Icon";
import { actionLinks, landingImages } from "@/lib/landing/site";

const HERO_BADGES: { icon: IconName; label: string; detail: string }[] = [
  { icon: "shield-check", label: "Verified neighbors", detail: "Admin-approved access" },
  { icon: "megaphone", label: "Notices & events", detail: "Reach the right residents" },
  { icon: "calendar-days", label: "Amenity bookings", detail: "Shared spaces, simplified" },
];

export function Hero() {
  return (
    <section id="top" className="lp-hero scroll-mt-0">
      <Container size="xl" className="relative z-10">
        <div className="lp-hero__grid">
          <div className="lp-hero__copy">
            <p className="lp-hero__eyebrow animate-fade-up">Community platform for HOAs</p>

            <h1 className="animate-fade-up delay-100">
              <span className="lp-hero__brand">Havena</span>
              <span className="lp-hero__headline">
                <span className="lp-hero__headline-main">Neighborhood life,</span>
                <span className="lp-hero__headline-sub">organized with calm clarity.</span>
              </span>
            </h1>

            <p className="lp-hero__lede animate-fade-up delay-200">
              Notices, amenity bookings, wellness, and local deals in one verified platform for
              residents and admins.
            </p>

            <div className="lp-hero__actions animate-fade-up delay-300">
              <Button
                href={actionLinks.signUp}
                variant="white"
                size="lg"
                iconTrailing="arrow-right"
                className="lp-hero__cta"
              >
                Get started
              </Button>
              <LandingSectionButton
                sectionId="how-it-works"
                variant="secondary"
                size="lg"
                className="lp-hero__ghost"
              >
                See how it works
              </LandingSectionButton>
            </div>
          </div>

          <div className="lp-hero__visual animate-fade-up delay-200">
            <div className="lp-hero__visual-frame">
              <div className="lp-hero__visual-glow" aria-hidden="true" />

              <div className="lp-hero__image-shell">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={landingImages.heroCommunity}
                  alt="Neighbors connecting in a welcoming residential community"
                  className="lp-hero__image"
                  fetchPriority="high"
                />

                <div className="lp-hero__float-card">
                  <span className="lp-hero__float-icon" aria-hidden="true">
                    <Icon name="users" className="h-4 w-4" />
                  </span>
                  <div className="lp-hero__float-text">
                    <span className="lp-hero__float-title">Residents + admins</span>
                    <span className="lp-hero__float-sub">One shared community hub</span>
                  </div>
                </div>

                <p className="lp-hero__image-caption">
                  <span className="lp-hero__caption-dot" aria-hidden="true" />
                  Built for verified neighborhoods
                </p>
              </div>
            </div>

            <div className="lp-hero__badge-panel" aria-label="Community platform highlights">
              {HERO_BADGES.map((badge) => (
                <article key={badge.label} className="lp-hero__badge">
                  <span className="lp-hero__badge-icon" aria-hidden="true">
                    <Icon name={badge.icon} className="h-4 w-4" />
                  </span>
                  <div className="lp-hero__badge-copy">
                    <span className="lp-hero__badge-label">{badge.label}</span>
                    <span className="lp-hero__badge-detail">{badge.detail}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default Hero;
