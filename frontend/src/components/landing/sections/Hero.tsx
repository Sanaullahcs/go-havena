import { Button } from "../ui/Button";
import { actionLinks, landingImages } from "@/lib/landing/site";

export function Hero() {
  return (
    <section id="top" className="lp-hero lp-hero--bleed scroll-mt-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={landingImages.hero}
        alt=""
        className="lp-hero__bg"
        fetchPriority="high"
        aria-hidden
      />
      <div className="lp-hero__veil" aria-hidden />

      <div className="lp-hero__content">
        <p className="lp-hero__eyebrow animate-fade-up">For community operators</p>

        <h1 className="lp-hero__heading animate-fade-up delay-100">
          <span className="lp-hero__brand">Havena</span>
          <span className="lp-hero__line">
            One subscription.
            <em> Every resident invited in.</em>
          </span>
        </h1>

        <p className="lp-hero__lede animate-fade-up delay-200">
          Buy seats for your HOA or neighborhood, then onboard people into a verified hub for
          notices, amenities, and daily life — residents never pay Havena.
        </p>

        <div className="lp-hero__actions animate-fade-up delay-300">
          <Button
            href={actionLinks.signUp}
            variant="primary"
            size="lg"
            iconTrailing="arrow-right"
            className="lp-hero__cta"
          >
            Start your community
          </Button>
          <Button href="#pricing" variant="white" size="lg" className="lp-hero__ghost" link={false}>
            View plans
          </Button>
        </div>
      </div>

      <a href="#platform" className="lp-hero__scroll animate-fade-up delay-400">
        <span>Explore the platform</span>
        <span className="lp-hero__scroll-line" aria-hidden />
      </a>
    </section>
  );
}

export default Hero;
