import { Button } from "../ui/Button";
import { MobileAppMockup } from "../ui/MobileAppMockup";
import { actionLinks } from "@/lib/landing/site";

export function Hero() {
  return (
    <section id="top" className="lp-hero lp-hero--split scroll-mt-0">
      <div className="lp-hero--split__grid">
        <div className="lp-hero--split__copy animate-fade-up">
          <p className="lp-hero--split__eyebrow">For community operators</p>
          <h1 className="lp-hero--split__title">
            One subscription. Every resident invited in.
          </h1>
          <p className="lp-hero--split__lede">
            Subscribe once for your HOA or neighborhood, then invite residents into one verified
            hub for notices, amenities, and daily life.
          </p>
          <div className="lp-hero--split__actions">
            <Button
              href={actionLinks.signUp}
              variant="primary"
              size="lg"
              iconTrailing="arrow-right"
            >
              Start your community
            </Button>
            <Button href="#pricing" variant="outline" size="lg" link={false}>
              View plans
            </Button>
          </div>
        </div>

        <div className="lp-hero--split__visual animate-fade-up delay-100">
          <MobileAppMockup variant="home" size="hero" glow className="lp-hero--split__phone" />
        </div>
      </div>
    </section>
  );
}

export default Hero;
