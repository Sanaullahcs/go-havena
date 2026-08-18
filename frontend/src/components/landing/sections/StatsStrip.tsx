import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { trustPills } from "@/lib/landing/content";

export function StatsStrip() {
  return (
    <section aria-label="Platform highlights" className="lp-stats lp-stats--pills">
      <Container size="xl">
        <ul className="lp-stats--pills__grid">
          {trustPills.map((pill, index) => (
            <li key={pill.label} className="lp-stats--pills__item">
              <Reveal delay={index * 60}>
                <span className="lp-stats--pills__label">{pill.label}</span>
                <span className="lp-stats--pills__detail">{pill.detail}</span>
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default StatsStrip;
