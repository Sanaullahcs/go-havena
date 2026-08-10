import { Container } from "../ui/Container";

const STATS = [
  { value: "6", label: "Core modules", detail: "Notices to wellness" },
  { value: "3", label: "Step onboarding", detail: "Invite to everyday use" },
  { value: "2", label: "Surfaces", detail: "Mobile app + web console" },
  { value: "100%", label: "Verified access", detail: "Members-only communities" },
];

export function StatsStrip() {
  return (
    <section aria-label="Platform highlights" className="lp-stats">
      <Container size="xl">
        <ul className="lp-stats__grid">
          {STATS.map((stat) => (
            <li key={stat.label} className="lp-stats__item">
              <span className="lp-stats__value">{stat.value}</span>
              <span className="lp-stats__label">{stat.label}</span>
              <span className="lp-stats__detail">{stat.detail}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default StatsStrip;
