import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { Icon } from "../icons/Icon";
import { safetyPoints } from "@/lib/landing/content";

export function SafetySection() {
  return (
    <section id="safety" className="lp-section lp-safety scroll-mt-28" aria-labelledby="safety-title">
      <Container size="xl">
        <Reveal className="lp-safety__head">
          <p className="lp-label lp-label--plain">Safety & moderation</p>
          <h2 id="safety-title" className="lp-title">
            A safe space for every neighbor.
          </h2>
          <p className="lp-body lp-safety__lede">
            Strict moderation maintains a positive atmosphere. Political conflict, harassment,
            spam, and discrimination are flagged and reviewed — safety starts with verified
            residency.
          </p>
        </Reveal>

        <ul className="lp-safety__grid">
          {safetyPoints.map((point, index) => (
            <li key={point.title}>
              <Reveal delay={index * 70} className="lp-safety__card">
                <span className="lp-safety__icon" aria-hidden="true">
                  <Icon name={point.icon} className="h-5 w-5" />
                </span>
                <h3 className="lp-safety__title">{point.title}</h3>
                <p className="lp-safety__body">{point.body}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default SafetySection;
