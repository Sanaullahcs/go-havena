/** CSS admin dashboard preview for landing mockups. */
export function HavenaDashboardPreview({ className = "" }: { className?: string }) {
  return (
    <div className={["lp-dash-preview", className].filter(Boolean).join(" ")} aria-hidden="true">
      <div className="lp-dash-preview__stats">
        <article className="lp-dash-preview__stat lp-dash-preview__stat--teal">
          <p className="lp-dash-preview__stat-label">Active members</p>
          <p className="lp-dash-preview__stat-value">248</p>
          <p className="lp-dash-preview__stat-meta">12 pending</p>
        </article>
        <article className="lp-dash-preview__stat lp-dash-preview__stat--navy">
          <p className="lp-dash-preview__stat-label">Notices sent</p>
          <p className="lp-dash-preview__stat-value">36</p>
          <p className="lp-dash-preview__stat-meta">This month</p>
        </article>
        <article className="lp-dash-preview__stat lp-dash-preview__stat--violet">
          <p className="lp-dash-preview__stat-label">Bookings</p>
          <p className="lp-dash-preview__stat-value">19</p>
          <p className="lp-dash-preview__stat-meta">Amenity deck</p>
        </article>
        <article className="lp-dash-preview__stat lp-dash-preview__stat--amber">
          <p className="lp-dash-preview__stat-label">Deal views</p>
          <p className="lp-dash-preview__stat-value">1.2k</p>
          <p className="lp-dash-preview__stat-meta">+18% week</p>
        </article>
      </div>

      <div className="lp-dash-preview__main">
        <article className="lp-dash-preview__panel lp-dash-preview__panel--wide">
          <div className="lp-dash-preview__panel-head">
            <p className="lp-dash-preview__panel-title">Daily activity</p>
            <span className="lp-dash-preview__panel-badge">7-day</span>
          </div>
          <div className="lp-dash-preview__chart">
            <span className="lp-dash-preview__bar" style={{ height: "38%" }} />
            <span className="lp-dash-preview__bar" style={{ height: "52%" }} />
            <span className="lp-dash-preview__bar" style={{ height: "44%" }} />
            <span className="lp-dash-preview__bar" style={{ height: "68%" }} />
            <span className="lp-dash-preview__bar lp-dash-preview__bar--peak" style={{ height: "92%" }} />
            <span className="lp-dash-preview__bar" style={{ height: "61%" }} />
            <span className="lp-dash-preview__bar" style={{ height: "48%" }} />
          </div>
        </article>

        <article className="lp-dash-preview__panel">
          <div className="lp-dash-preview__panel-head">
            <p className="lp-dash-preview__panel-title">Membership</p>
          </div>
          <div className="lp-dash-preview__donut-wrap">
            <div className="lp-dash-preview__donut">
              <span>96%</span>
            </div>
            <ul className="lp-dash-preview__legend">
              <li><span className="lp-dash-preview__dot lp-dash-preview__dot--green" />Approved 238</li>
              <li><span className="lp-dash-preview__dot lp-dash-preview__dot--amber" />Pending 10</li>
            </ul>
          </div>
        </article>
      </div>

      <div className="lp-dash-preview__list">
        <article className="lp-dash-preview__row">
          <span className="lp-dash-preview__row-icon lp-dash-preview__row-icon--megaphone" />
          <div>
            <p className="lp-dash-preview__row-title">Pool maintenance notice published</p>
            <p className="lp-dash-preview__row-meta">2 hours ago · 248 recipients</p>
          </div>
        </article>
        <article className="lp-dash-preview__row">
          <span className="lp-dash-preview__row-icon lp-dash-preview__row-icon--users" />
          <div>
            <p className="lp-dash-preview__row-title">3 residents approved</p>
            <p className="lp-dash-preview__row-meta">Today · Sunflower Heights</p>
          </div>
        </article>
      </div>
    </div>
  );
}

export default HavenaDashboardPreview;
