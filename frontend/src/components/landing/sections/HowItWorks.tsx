import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { howItWorksSteps } from "@/lib/landing/content";
import { actionLinks } from "@/lib/landing/site";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="lp-section lp-process-v2 scroll-mt-28">
      <Container size="xl">
        <Reveal className="lp-process-v2__head">
          <p className="lp-label lp-label--plain">How it works</p>
          <h2 className="lp-title">Three steps to your community hub.</h2>
          <p className="lp-body lp-process-v2__lede">
            From first invite to daily participation — Havena keeps onboarding simple for residents
            and admins alike.
          </p>
        </Reveal>

        <ol className="lp-process-v2__steps">
          {howItWorksSteps.map((step, index) => (
            <li key={step.num} className="lp-process-v2__step">
              <Reveal delay={index * 80}>
                <article className="lp-process-v2__card">
                  <span className="lp-process-v2__num">{step.num}</span>
                  <h3 className="lp-process-v2__title">{step.title}</h3>
                  <p className="lp-process-v2__body">{step.body}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal className="lp-process-v2__cta" delay={240}>
          <Button
            href={actionLinks.residentLogin}
            variant="primary"
            size="lg"
            iconTrailing="arrow-right"
          >
            Find your community
          </Button>
        </Reveal>
      </Container>
    </section>
  );
}

export default HowItWorks;
