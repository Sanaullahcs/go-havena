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
            <h2 className="lp-h2 mt-2">
              {productCopy.titleLine1}
              <br />
              {productCopy.titleLine2}
            </h2>
          </div>
        </Reveal>

        <div className="lp-features__grid">
          <Reveal as="article" className="lp-features__main lp-reveal--scale" delay={80}>
            <p className="lp-features__tag">{productCopy.mainTag}</p>
            <h3 className="lp-features__title">
              {productCopy.mainTitleLine1}
              <br />
              {productCopy.mainTitleLine2}
            </h3>
            <p className="lp-features__text">{productCopy.mainText}</p>

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
                <Shield className="h-4 w-4" aria-hidden />
              </div>
              <h3>{productCopy.cards[0].title}</h3>
              <p>{productCopy.cards[0].text}</p>
            </Reveal>

            <Reveal as="article" className="lp-features__card" delay={240}>
              <div className="lp-features__icon">
                <Sparkles className="h-4 w-4" aria-hidden />
              </div>
              <h3>{productCopy.cards[1].title}</h3>
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
            <p className="lp-eyebrow">{peopleCopy.eyebrow}</p>
            <h2 className="lp-h2 mt-3 max-w-xl">{peopleCopy.title}</h2>
          </div>
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
