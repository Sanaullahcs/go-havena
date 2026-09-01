import { Building2, GraduationCap, Home, Megaphone, Sparkles, Users } from "lucide-react";
import { peopleCards, trustLogos } from "@/lib/marketing/content";
import { Reveal } from "@/components/marketing/reveal";

const peopleIcons = {
  home: Home,
  school: GraduationCap,
  users: Users,
  building: Building2,
} as const;

export function MarketingTrustBar() {
  return (
    <section className="lp-trust-strip" aria-label="Trusted by">
      <div className="lp-container">
        <div className="lp-trust-logos">
          {trustLogos.map((name) => (
            <span key={name} className="lp-trust-logo">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketingFeatures() {
  return (
    <section id="product" className="lp-features">
      <div className="lp-container">
        <Reveal className="lp-features__header">
          <div>
            <p className="lp-eyebrow">Everything in one place</p>
            <h2 className="lp-h2 mt-2 max-w-xl">
              Community software that feels calm, useful, and human.
            </h2>
          </div>
          <p className="lp-features__intro">
            Give every member a clear starting point, keep updates relevant, and make participation
            feel simple, without another noisy feed to manage.
          </p>
        </Reveal>

        <div className="lp-features__grid">
          <Reveal as="article" className="lp-features__main lp-reveal--scale" delay={80}>
            <p className="lp-features__tag">Connection by design</p>
            <h3 className="lp-features__title">Give every member a clear place to start.</h3>
            <p className="lp-features__text">
              A calm home feed, notices, and tools in one view, so members always know where to begin.
            </p>

            <div className="lp-features__preview">
              <div className="lp-features__preview-bar">
                <div className="lp-features__preview-dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
                <span className="lp-features__preview-label">Community admin · Dashboard</span>
              </div>
              <div className="lp-features__preview-shot">
                <span className="lp-features__preview-shine" aria-hidden />
                <img
                  src="/marketing/dashboard-hero.png?v=7"
                  alt="Havena community admin dashboard showing member growth, membership status, and community metrics"
                  width={2833}
                  height={1770}
                />
              </div>
            </div>
          </Reveal>

          <div className="lp-features__side">
            <Reveal as="article" className="lp-features__card lp-features__card--blue" delay={160}>
              <div className="lp-features__icon lp-features__icon--on-blue">
                <Megaphone className="h-4 w-4" aria-hidden />
              </div>
              <h3>Relevant, not noisy.</h3>
              <p>
                Members join the conversations, events, and updates that matter to them, without an
                endless feed.
              </p>
            </Reveal>

            <Reveal as="article" className="lp-features__card" delay={240}>
              <div className="lp-features__icon">
                <Sparkles className="h-4 w-4" aria-hidden />
              </div>
              <h3>Participation made simple.</h3>
              <p>
                Ready, easy, and private. Discover and connect without constant notification noise.
              </p>
            </Reveal>

            <Reveal as="article" className="lp-features__side-preview lp-reveal--scale" delay={300}>
              <div className="lp-features__preview">
                <div className="lp-features__preview-bar">
                  <div className="lp-features__preview-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="lp-features__preview-label">Community admin · Notices</span>
                </div>
                <div className="lp-features__preview-shot">
                  <span className="lp-features__preview-shine" aria-hidden />
                  <img
                    src="/marketing/dashboard-features.png?v=10"
                    alt="Havena notices dashboard with published community announcements"
                    width={1440}
                    height={900}
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketingPeopleGrid() {
  return (
    <section id="communities" className="lp-people">
      <div className="lp-container">
        <Reveal className="lp-people__header">
          <div>
            <p className="lp-eyebrow">Built around people</p>
            <h2 className="lp-h2 mt-3 max-w-xl">
              Flexible enough for the communities people already live in.
            </h2>
          </div>
          <p className="lp-people__intro">
            From neighborhoods to workplaces, Havena adapts to the way people already gather,
            without forcing a one-size-fits-all community model.
          </p>
        </Reveal>

        <div className="lp-people__grid">
          {peopleCards.map((card, index) => {
            const Icon = peopleIcons[card.icon as keyof typeof peopleIcons];
            return (
              <Reveal
                key={card.title}
                as="article"
                className="lp-people__card"
                delay={80 + index * 70}
              >
                <div className="lp-people__icon">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
