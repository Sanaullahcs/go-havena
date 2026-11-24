import { Building2, GraduationCap, Home, Shield, Sparkles, Users } from "lucide-react";
import { peopleCards, peopleCopy, productCopy, trustLogos } from "@/lib/marketing/content";
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
            <p className="lp-eyebrow">{productCopy.eyebrow}</p>
            <h2 className="lp-h2 lp-section-headline mt-2">
              <span>{productCopy.titleLine1}</span>
              <span className="lp-section-accent">{productCopy.titleLine2}</span>
            </h2>
          </div>
          <p className="lp-features__intro">{productCopy.lead}</p>
        </Reveal>

        <div className="lp-features__grid">
          <Reveal as="article" className="lp-features__main lp-reveal--scale" delay={80}>
            <div className="lp-features__intro-row">
              <div className="lp-features__copy">
                <p className="lp-features__tag">{productCopy.mainTag}</p>
                <h3 className="lp-features__title">
                  <span>{productCopy.mainTitleLine1}</span>
                  <span className="lp-features__title-accent">{productCopy.mainTitleLine2}</span>
                </h3>
              </div>
              <p className="lp-features__text">
                <span>Membership, notices, and activity live in one view.</span>
                <span>The week is no longer rebuilt from inboxes and group chats.</span>
              </p>
            </div>
            <ul className="lp-features__points">
              {productCopy.points.map((point) => (
                <li key={point.label}>
                  <strong>{point.label}</strong>
                  <span>{point.detail}</span>
                </li>
              ))}
            </ul>

            <div className="lp-features__preview">
              <div className="lp-features__preview-bar">
                <div className="lp-features__preview-dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
                <span className="lp-features__preview-label">Dashboard</span>
                <span className="lp-features__preview-live">Today</span>
              </div>
              <div className="lp-features__preview-shot">
                <span className="lp-features__preview-shine" aria-hidden />
                <img
                  className="lp-parallax"
                  data-depth="22"
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
              <div className="lp-features__card-head">
                <div className="lp-features__icon lp-features__icon--on-blue">
                  <Shield className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <p className="lp-features__kicker">{productCopy.cards[0].kicker}</p>
                  <h3>{productCopy.cards[0].title}</h3>
                </div>
              </div>
              <p>{productCopy.cards[0].text}</p>
            </Reveal>

            <Reveal as="article" className="lp-features__card" delay={240}>
              <div className="lp-features__card-head">
                <div className="lp-features__icon">
                  <Sparkles className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <p className="lp-features__kicker">{productCopy.cards[1].kicker}</p>
                  <h3>{productCopy.cards[1].title}</h3>
                </div>
              </div>
              <p>{productCopy.cards[1].text}</p>
            </Reveal>

            <Reveal as="article" className="lp-features__side-preview lp-reveal--scale" delay={300}>
              <div className="lp-features__preview">
                <div className="lp-features__preview-bar">
                  <div className="lp-features__preview-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="lp-features__preview-label">Notices</span>
                </div>
                <div className="lp-features__preview-shot">
                  <span className="lp-features__preview-shine" aria-hidden />
                  <img
                    className="lp-parallax"
                    data-depth="-18"
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
            <p className="lp-eyebrow">{peopleCopy.eyebrow}</p>
            <h2 className="lp-h2 lp-section-headline mt-3 max-w-xl">
              {peopleCopy.titleLines.map((line, index) => (
                <span key={line} className={index === 1 ? "lp-section-accent" : undefined}>
                  {line}
                </span>
              ))}
            </h2>
          </div>
          <p className="lp-people__intro">{peopleCopy.lead}</p>
        </Reveal>

        <div className="lp-people__grid">
          {peopleCards.map((card, index) => {
            const Icon = peopleIcons[card.icon as keyof typeof peopleIcons];
            return (
              <Reveal
                key={card.title}
                as="article"
                className={`lp-people__card lp-people__card--${card.tone}`}
                delay={80 + index * 70}
              >
                <div className="lp-people__icon">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <p className="lp-people__kicker">{card.kicker}</p>
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
