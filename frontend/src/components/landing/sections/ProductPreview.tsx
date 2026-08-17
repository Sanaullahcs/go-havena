import { Container } from "../ui/Container";
import { MobileAppMockup } from "../ui/MobileAppMockup";
import { DashboardMockup } from "../ui/DashboardMockup";
import { Icon } from "../icons/Icon";

const RESIDENT_SCREENS = [
  { variant: "feed" as const, label: "Community feed", tilt: "left" as const },
  { variant: "home" as const, label: "Resident home", tilt: "none" as const, featured: true },
  { variant: "marketplace" as const, label: "Local deals", tilt: "right" as const },
  { variant: "wellness" as const, label: "Wellness", tilt: "right" as const, peek: true },
];

const EXPERIENCES = ["Feed", "Home", "Deals", "Wellness"];

export function ProductPreview() {
  return (
    <section id="preview" className="lp-section lp-product-preview relative overflow-x-clip">
      <div aria-hidden="true" className="soft-section absolute inset-0 -z-20" />

      <Container size="xl">
        <header className="lp-product-preview__head">
          <span className="section-label justify-center">Product preview</span>
          <h2 className="section-title mt-3">
            One platform.{" "}
            <span className="gradient-text">Four resident experiences.</span>
          </h2>
          <p className="lp-product-preview__lead">
            Feed, home, deals, and wellness — synced live with your admin dashboard.
          </p>
        </header>

        <div className="lp-product-preview__stage">
          <div className="lp-product-preview__residents">
            <div className="lp-product-preview__panel-top">
              <div className="lp-product-preview__block-label">
                <Icon name="phone" className="h-4 w-4" />
                Residents
              </div>
              <ul className="lp-product-preview__experiences" aria-label="Resident experiences">
                {EXPERIENCES.map((label, index) => (
                  <li key={label} className="lp-product-preview__experience">
                    {index > 0 ? <span className="lp-product-preview__experience-sep" aria-hidden="true" /> : null}
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-product-preview__phones">
              <div className="lp-product-preview__phones-glow" aria-hidden="true" />
              {RESIDENT_SCREENS.map((screen) => (
                <figure
                  key={screen.label}
                  className={[
                    "lp-product-preview__phone",
                    screen.featured ? "lp-product-preview__phone--featured" : "",
                    screen.tilt === "left" ? "lp-product-preview__phone--left" : "",
                    screen.tilt === "right" && !screen.peek ? "lp-product-preview__phone--right" : "",
                    screen.peek ? "lp-product-preview__phone--peek" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <MobileAppMockup
                    variant={screen.variant}
                    size={screen.featured ? "hero" : screen.peek ? "sm" : "default"}
                    tilt={screen.peek ? "right" : screen.tilt}
                    glow={screen.featured}
                  />
                  <figcaption className="lp-product-preview__caption">{screen.label}</figcaption>
                </figure>
              ))}
            </div>

            <p className="lp-product-preview__footnote">
              Live community updates on every resident phone — notices, deals, and wellness in one place.
            </p>
          </div>

          <div className="lp-product-preview__bridge" aria-hidden="true">
            <span className="lp-product-preview__sync">
              <Icon name="zap" className="h-4 w-4" />
              Synced
            </span>
          </div>

          <div className="lp-product-preview__admins">
            <div className="lp-product-preview__panel-top">
              <div className="lp-product-preview__block-label">
                <Icon name="bar-chart" className="h-4 w-4" />
                Admins
              </div>
              <p className="lp-product-preview__admin-note">Web dashboard</p>
            </div>
            <DashboardMockup className="lp-product-preview__dashboard" />
            <p className="lp-product-preview__footnote">
              Approvals, notices, bookings, and activity — the same community, managed from the web.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default ProductPreview;
