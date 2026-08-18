import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { MobileAppMockup } from "../ui/MobileAppMockup";
import { Reveal } from "../ui/Reveal";
import { Icon } from "../icons/Icon";
import { residentBullets } from "@/lib/landing/content";
import { actionLinks } from "@/lib/landing/site";

export function ResidentsSection() {
  return (
    <section id="residents" className="lp-section lp-audience scroll-mt-28">
      <Container size="xl">
        <div className="lp-audience__grid">
          <Reveal className="lp-audience__visual">
            <MobileAppMockup
              alt="Havena mobile app home screen with community feed and local deals"
              size="default"
            />
          </Reveal>

          <Reveal className="lp-audience__copy" delay={100}>
            <p className="lp-label lp-label--plain">For residents</p>
            <h2 className="lp-title">Built for daily neighborhood life.</h2>
            <p className="lp-body lp-audience__lede">
              The mobile app is the primary experience — quick access to notices, feed, deals,
              wellness, and amenity bookings from your pocket.
            </p>

            <ul className="lp-audience__list">
              {residentBullets.map((point) => (
                <li key={point}>
                  <Icon name="check-circle-2" className="h-4 w-4 shrink-0 text-brand" />
                  {point}
                </li>
              ))}
            </ul>

            <div className="lp-audience__actions">
              <Button
                href={actionLinks.residentLogin}
                variant="primary"
                size="lg"
                iconTrailing="arrow-right"
              >
                Find your community
              </Button>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

export default ResidentsSection;
