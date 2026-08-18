import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { actionLinks } from "@/lib/landing/site";

export function CTABanner() {
  return (
    <section aria-label="Get started" className="lp-cta-banner-v2">
      <Container size="xl">
        <Reveal>
          <div className="lp-cta-banner-v2__inner">
            <div className="lp-cta-banner-v2__copy">
              <p className="lp-label lp-label--on-dark">Ready when you are</p>
              <h2 className="lp-cta-banner-v2__title">
                Ready to bring your community together?
              </h2>
              <p className="lp-cta-banner-v2__lede">
                Launch verified onboarding, resident engagement, and admin operations from one calm
                community hub.
              </p>
            </div>

            <div className="lp-cta-banner-v2__actions">
              <Button
                href={actionLinks.residentLogin}
                variant="white"
                size="lg"
                iconTrailing="arrow-right"
              >
                Get the app
              </Button>
              <Button
                href="#contact"
                variant="outline"
                size="lg"
                className="lp-cta-banner-v2__secondary"
                link={false}
              >
                Contact us
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

export default CTABanner;
