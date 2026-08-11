import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { actionLinks } from "@/lib/landing/site";

export function CTABanner() {
  return (
    <section aria-label="Get started" className="lp-cta-banner">
      <Container size="xl">
        <div className="lp-cta-banner__inner">
          <div className="lp-cta-banner__copy">
            <p className="lp-label lp-label--on-dark">Ready when you are</p>
            <h2 className="lp-cta-banner__title">Subscribe once. Invite everyone home.</h2>
            <p className="lp-cta-banner__lede">
              Launch verified onboarding, resident engagement, and admin operations from one calm
              community hub.
            </p>
          </div>

          <div className="lp-cta-banner__actions">
            <Button href={actionLinks.signUp} variant="white" size="lg" iconTrailing="arrow-right">
              Start your community
            </Button>
            <Button href="#pricing" variant="outline" size="lg" className="lp-cta-banner__secondary" link={false}>
              View plans
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default CTABanner;
