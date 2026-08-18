import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { Icon } from "../icons/Icon";

export function ProblemSolution() {
  return (
    <section id="platform" className="lp-section lp-problem scroll-mt-28">
      <Container size="xl">
        <div className="lp-problem__grid">
          <Reveal className="lp-problem__copy">
            <p className="lp-label lp-label--plain">The problem</p>
            <h2 className="lp-title">
              Neighborhood life shouldn&apos;t live in five different apps.
            </h2>
            <p className="lp-body lp-problem__lede">
              Residents juggle group chats, email blasts, paper notices, and random social groups.
              Important updates get lost. Moderation is impossible. Trust erodes.
            </p>
          </Reveal>

          <Reveal className="lp-problem__solution" delay={100}>
            <div className="lp-problem__solution-card">
              <span className="lp-problem__solution-icon" aria-hidden="true">
                <Icon name="home" className="h-6 w-6" />
              </span>
              <p className="lp-label lp-label--plain">The Havena answer</p>
              <h3 className="lp-problem__solution-title">
                One verified home for your entire community.
              </h3>
              <p className="lp-body">
                Havena replaces the chaos with a single moderated platform — notices, feed,
                marketplace, wellness, and property tools scoped to your neighborhood.
              </p>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

export default ProblemSolution;
