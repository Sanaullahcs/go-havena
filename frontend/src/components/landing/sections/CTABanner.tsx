import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { actionLinks } from "@/lib/landing/site";

export function CTABanner() {
  return (
    <section aria-label="Get started" className="lp-cta-banner">
      <Container size="xl">
        <div className="lp-cta-banner__inner">
          <div className="lp-cta-banner__copy">
            <p className="lp-label lp-label--on-dark">Get started</p>
            <h2 className="lp-cta-banner__title">Bring your community onto one trusted home base</h2>
            <p className="lp-cta-banner__lede">
              Launch verified onboarding, resident engagement, and admin operations without
              replacing your entire tech stack on day one.
            </p>
          </div>

          <div className="lp-cta-banner__actions">
            <Button href={actionLinks.signUp} variant="white" size="lg" iconTrailing="arrow-right">
              Get started free
            </Button>
            <Button href="#contact" variant="outline" size="lg" className="lp-cta-banner__secondary">
              Talk to us
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default CTABanner;
