import type { JSX, ReactNode } from "react";

export type AppScreenVariant = "home" | "feed" | "marketplace" | "wellness";

type HavenaAppScreenPreviewProps = {
  className?: string;
  variant?: AppScreenVariant;
};

function ScreenShell({
  children,
  className,
  activeTab = "home",
}: {
  children: ReactNode;
  className?: string;
  activeTab?: "home" | "community" | "alerts" | "market";
}) {
  return (
    <div className={["lp-app-preview", className].filter(Boolean).join(" ")} aria-hidden="true">
      <div className="lp-app-preview__status">
        <span>9:41</span>
        <span className="lp-app-preview__status-icons">
          <span />
          <span />
          <span />
        </span>
      </div>
      {children}
      <nav className="lp-app-preview__tabbar">
        <span className={["lp-app-preview__tab", activeTab === "home" ? "lp-app-preview__tab--active" : ""].join(" ")}>
          Home
        </span>
        <span className={["lp-app-preview__tab", activeTab === "community" ? "lp-app-preview__tab--active" : ""].join(" ")}>
          Community
        </span>
        <span className="lp-app-preview__fab">+</span>
        <span className={["lp-app-preview__tab", activeTab === "alerts" ? "lp-app-preview__tab--active" : ""].join(" ")}>
          Alerts
        </span>
        <span className={["lp-app-preview__tab", activeTab === "market" ? "lp-app-preview__tab--active" : ""].join(" ")}>
          Market
        </span>
      </nav>
    </div>
  );
}

function HomeScreen() {
  return (
    <>
      <header className="lp-app-preview__header">
        <span className="lp-app-preview__menu" />
        <div className="lp-app-preview__location">
          <span className="lp-app-preview__pin" />
          <div>
            <p className="lp-app-preview__community">Sunflower Heights Estate</p>
            <p className="lp-app-preview__sub">Unit 12A · Austin, TX</p>
          </div>
        </div>
        <span className="lp-app-preview__avatar" />
      </header>
      <div className="lp-app-preview__body">
        <article className="lp-app-preview__notice">
          <p className="lp-app-preview__notice-tag">Community notice</p>
          <h3 className="lp-app-preview__notice-title">Pool maintenance this weekend</h3>
          <p className="lp-app-preview__notice-meta">Sat 9:00 AM – 4:00 PM · Amenity deck</p>
        </article>
        <div className="lp-app-preview__qa">
          <span>New post</span>
          <span>Book</span>
          <span>Sell</span>
          <span>Notices</span>
        </div>
        <section className="lp-app-preview__section">
          <div className="lp-app-preview__section-head">
            <span>Happening soon</span>
            <span className="lp-app-preview__chev" />
          </div>
          <article className="lp-app-preview__event">
            <div className="lp-app-preview__event-img" />
            <div>
              <p className="lp-app-preview__event-title">Community BBQ</p>
              <p className="lp-app-preview__event-meta">Sun · 5:00 PM · Rooftop</p>
            </div>
          </article>
        </section>
        <section className="lp-app-preview__section">
          <div className="lp-app-preview__section-head">
            <span>Deal corner</span>
            <span className="lp-app-preview__chev" />
          </div>
          <div className="lp-app-preview__deals">
            <article className="lp-app-preview__deal">
              <p className="lp-app-preview__deal-badge">20% off</p>
              <p className="lp-app-preview__deal-title">Local laundry</p>
            </article>
            <article className="lp-app-preview__deal lp-app-preview__deal--alt">
              <p className="lp-app-preview__deal-badge">BOGO</p>
              <p className="lp-app-preview__deal-title">Coffee shop</p>
            </article>
          </div>
        </section>
      </div>
    </>
  );
}

function FeedScreen() {
  return (
    <>
      <header className="lp-app-preview__topbar">
        <span className="lp-app-preview__back" />
        <p className="lp-app-preview__topbar-title">Community feed</p>
        <span className="lp-app-preview__topbar-action" />
      </header>
      <div className="lp-app-preview__body lp-app-preview__body--flush">
        <article className="lp-app-preview__feed lp-app-preview__feed--large">
          <div className="lp-app-preview__feed-head">
            <span className="lp-app-preview__feed-avatar" />
            <div>
              <p className="lp-app-preview__feed-name">Sarah Chen</p>
              <p className="lp-app-preview__feed-time">2h ago · Building B</p>
            </div>
          </div>
          <p className="lp-app-preview__feed-body">
            Yoga class in the courtyard tomorrow — who&apos;s joining?
          </p>
          <div className="lp-app-preview__feed-stats">
            <span>12 likes</span>
            <span>5 comments</span>
          </div>
        </article>
        <article className="lp-app-preview__feed">
          <div className="lp-app-preview__feed-head">
            <span className="lp-app-preview__feed-avatar lp-app-preview__feed-avatar--alt" />
            <div>
              <p className="lp-app-preview__feed-name">Marcus Johnson</p>
              <p className="lp-app-preview__feed-time">4h ago</p>
            </div>
          </div>
          <p className="lp-app-preview__feed-body">Great turnout at the book swap last night!</p>
        </article>
        <article className="lp-app-preview__feed">
          <div className="lp-app-preview__feed-head">
            <span className="lp-app-preview__feed-avatar lp-app-preview__feed-avatar--violet" />
            <div>
              <p className="lp-app-preview__feed-name">Emily Rodriguez</p>
              <p className="lp-app-preview__feed-time">Yesterday</p>
            </div>
          </div>
          <p className="lp-app-preview__feed-body">Looking for a reliable dog walker nearby.</p>
          <span className="lp-app-preview__chip">Question</span>
        </article>
      </div>
    </>
  );
}

function MarketplaceScreen() {
  return (
    <>
      <header className="lp-app-preview__topbar">
        <span className="lp-app-preview__back" />
        <p className="lp-app-preview__topbar-title">Deal corner</p>
        <span className="lp-app-preview__topbar-action" />
      </header>
      <div className="lp-app-preview__body lp-app-preview__body--flush">
        <div className="lp-app-preview__search">Search local deals…</div>
        <section className="lp-app-preview__section">
          <div className="lp-app-preview__section-head">
            <span>Featured</span>
          </div>
          <article className="lp-app-preview__market-card lp-app-preview__market-card--hero">
            <div className="lp-app-preview__market-badge">20% OFF</div>
            <p className="lp-app-preview__market-title">Green Bowl Kitchen</p>
            <p className="lp-app-preview__market-meta">Residents only · 0.4 mi</p>
          </article>
        </section>
        <div className="lp-app-preview__deals lp-app-preview__deals--stack">
          <article className="lp-app-preview__market-row">
            <span className="lp-app-preview__market-icon lp-app-preview__market-icon--mint" />
            <div>
              <p className="lp-app-preview__market-title">Zenith Fitness</p>
              <p className="lp-app-preview__market-meta">Free trial week</p>
            </div>
            <span className="lp-app-preview__market-pill">Free</span>
          </article>
          <article className="lp-app-preview__market-row">
            <span className="lp-app-preview__market-icon lp-app-preview__market-icon--amber" />
            <div>
              <p className="lp-app-preview__market-title">Daily Grind Coffee</p>
              <p className="lp-app-preview__market-meta">BOGO before 10 AM</p>
            </div>
            <span className="lp-app-preview__market-pill">BOGO</span>
          </article>
        </div>
      </div>
    </>
  );
}

function WellnessScreen() {
  return (
    <>
      <header className="lp-app-preview__topbar">
        <span className="lp-app-preview__back" />
        <p className="lp-app-preview__topbar-title">Wellness</p>
        <span className="lp-app-preview__topbar-action" />
      </header>
      <div className="lp-app-preview__body lp-app-preview__body--flush">
        <div className="lp-app-preview__wellness-hero">
          <p className="lp-app-preview__wellness-label">Your streak</p>
          <p className="lp-app-preview__wellness-value">7 days</p>
          <p className="lp-app-preview__wellness-sub">+210 points this week</p>
        </div>
        <section className="lp-app-preview__section">
          <div className="lp-app-preview__section-head">
            <span>Continue learning</span>
          </div>
          <article className="lp-app-preview__wellness-card">
            <span className="lp-app-preview__wellness-icon lp-app-preview__wellness-icon--blue" />
            <div>
              <p className="lp-app-preview__market-title">Body scan meditation</p>
              <p className="lp-app-preview__market-meta">12 min · +50 pts</p>
            </div>
          </article>
          <article className="lp-app-preview__wellness-card">
            <span className="lp-app-preview__wellness-icon lp-app-preview__wellness-icon--violet" />
            <div>
              <p className="lp-app-preview__market-title">Morning mobility</p>
              <p className="lp-app-preview__market-meta">8 min · +35 pts</p>
            </div>
          </article>
        </section>
      </div>
    </>
  );
}

const VARIANT_META: Record<
  AppScreenVariant,
  { activeTab: "home" | "community" | "alerts" | "market"; Screen: () => JSX.Element }
> = {
  home: { activeTab: "home", Screen: HomeScreen },
  feed: { activeTab: "community", Screen: FeedScreen },
  marketplace: { activeTab: "market", Screen: MarketplaceScreen },
  wellness: { activeTab: "alerts", Screen: WellnessScreen },
};

export function HavenaAppScreenPreview({
  className = "",
  variant = "home",
}: HavenaAppScreenPreviewProps) {
  const { activeTab, Screen } = VARIANT_META[variant];

  return (
    <ScreenShell className={className} activeTab={activeTab}>
      <Screen />
    </ScreenShell>
  );
}

export default HavenaAppScreenPreview;
