import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { MobileAppMockup } from "../ui/MobileAppMockup";
import { Reveal } from "../ui/Reveal";
import { Icon } from "../icons/Icon";
import { actionLinks } from "@/lib/landing/site";

const TRUST_ITEMS = [
  "Verified neighbors",
  "AI-moderated",
  "Invite-only communities",
] as const;

export function Hero() {
  return (
    <section id="top" className="lp-hero lp-hero--product scroll-mt-0">
      <Container size="xl">
        <div className="lp-hero--product__grid">
          <Reveal className="lp-hero--product__copy">
            <p className="lp-label lp-label--plain">Hyperlocal community platform</p>

            <h1 className="lp-hero--product__title">
              Your neighborhood,
              <span className="lp-hero--product__title-accent"> connected.</span>
            </h1>

            <p className="lp-body lp-hero--product__lede">
              Verified residents only. One app for notices, events, marketplace, wellness, and
              property life — inside a safe, moderated community.
            </p>

            <div className="lp-hero--product__actions">
              <Button
                href={actionLinks.residentLogin}
                variant="primary"
                size="lg"
                iconTrailing="arrow-right"
              >
                Get the app
              </Button>
              <Button href={actionLinks.signUp} variant="secondary" size="lg">
                Request admin access
              </Button>
            </div>

            <ul className="lp-hero--product__trust" aria-label="Platform highlights">
              {TRUST_ITEMS.map((item) => (
                <li key={item}>
                  <Icon name="check-circle-2" className="h-4 w-4 shrink-0 text-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="lp-hero--product__visual" delay={120}>
            <div className="lp-hero--product__phone-wrap">
              <MobileAppMockup size="hero" className="lp-hero--product__phone" />
              <div className="lp-hero--product__float lp-hero--product__float--notices">
                <Icon name="megaphone" className="h-4 w-4 text-brand-dark-teal" />
                <span>New community notice</span>
              </div>
              <div className="lp-hero--product__float lp-hero--product__float--deals">
                <Icon name="tag" className="h-4 w-4 text-brand" />
                <span>Local deal nearby</span>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

export default Hero;
