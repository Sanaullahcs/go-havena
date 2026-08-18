import { Icon } from "../icons/Icon";
import { Container } from "../ui/Container";
import { Reveal } from "../ui/Reveal";
import { featureGroups } from "@/lib/landing/content";

function FeatureCard({
  icon,
  title,
  body,
  className = "",
}: {
  icon: (typeof featureGroups)[number]["features"][number]["icon"];
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <article className={["lp-feature-card", className].filter(Boolean).join(" ")}>
      <span className="lp-feature-card__icon" aria-hidden="true">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <h3 className="lp-feature-card__title">{title}</h3>
      <p className="lp-feature-card__body">{body}</p>
    </article>
  );
}

export function Features() {
  return (
    <section id="features" className="lp-section lp-features-v2 scroll-mt-28">
      <Container size="xl">
        <Reveal className="lp-features-v2__head">
          <p className="lp-label lp-label--plain">Features</p>
          <h2 className="lp-title">Everything your community needs.</h2>
          <p className="lp-body lp-features-v2__lede">
            Organized for clarity — from daily notices to wellness, marketplace, and admin
            operations.
          </p>
        </Reveal>

        <div className="lp-features-v2__groups">
          {featureGroups.map((group, groupIndex) => (
            <Reveal key={group.id} delay={groupIndex * 80} className="lp-features-v2__group">
              <div className="lp-features-v2__group-head">
                <p className="lp-label lp-label--plain">{group.label}</p>
                <h3 className="lp-features-v2__group-title">{group.title}</h3>
              </div>

              {group.layout === "pair" ? (
                <ul className="lp-features-v2__pair">
                  {group.features.map((feature) => (
                    <li key={feature.title}>
                      <FeatureCard {...feature} />
                    </li>
                  ))}
                </ul>
              ) : null}

              {group.layout === "bento" ? (
                <ul className="lp-features-v2__bento">
                  {group.features.map((feature, index) => (
                    <li
                      key={feature.title}
                      className={index === 0 ? "lp-features-v2__bento-wide" : undefined}
                    >
                      <FeatureCard {...feature} />
                    </li>
                  ))}
                </ul>
              ) : null}

              {group.layout === "trio" ? (
                <ul className="lp-features-v2__trio">
                  {group.features.map((feature) => (
                    <li key={feature.title}>
                      <FeatureCard {...feature} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

export default Features;
