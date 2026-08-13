/** Static Havena home screen — rendered inside phone mockups. */
export function HavenaAppScreenPreview({ className = "" }: { className?: string }) {
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
            <span>Community feed</span>
            <span className="lp-app-preview__chev" />
          </div>
          <article className="lp-app-preview__feed">
            <div className="lp-app-preview__feed-head">
              <span className="lp-app-preview__feed-avatar" />
              <div>
                <p className="lp-app-preview__feed-name">Jessica Miller</p>
                <p className="lp-app-preview__feed-time">2h ago · Building A</p>
              </div>
            </div>
            <p className="lp-app-preview__feed-body">
              Does anyone know a good pediatrician nearby?
            </p>
            <span className="lp-app-preview__chip">Recommendation</span>
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

      <nav className="lp-app-preview__tabbar">
        <span className="lp-app-preview__tab lp-app-preview__tab--active">Home</span>
        <span className="lp-app-preview__tab">Community</span>
        <span className="lp-app-preview__fab">+</span>
        <span className="lp-app-preview__tab">Alerts</span>
        <span className="lp-app-preview__tab">Market</span>
      </nav>
    </div>
  );
}

export default HavenaAppScreenPreview;
