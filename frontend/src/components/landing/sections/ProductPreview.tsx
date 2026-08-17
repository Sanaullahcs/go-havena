import { Container } from "../ui/Container";
import { MobileAppMockup } from "../ui/MobileAppMockup";
import { DashboardMockup } from "../ui/DashboardMockup";
import { Icon } from "../icons/Icon";

const RESIDENT_SCREENS = [
  { variant: "feed" as const, label: "Community feed", tilt: "left" as const },
  { variant: "home" as const, label: "Resident home", tilt: "none" as const, featured: true },
  { variant: "marketplace" as const, label: "Local deals", tilt: "right" as const },
];

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
            <div className="lp-product-preview__block-label">
              <Icon name="phone" className="h-4 w-4" />
              Residents
            </div>

            <div className="lp-product-preview__phones">
              {RESIDENT_SCREENS.map((screen) => (
                <figure
                  key={screen.label}
                  className={[
                    "lp-product-preview__phone",
                    screen.featured ? "lp-product-preview__phone--featured" : "",
                    screen.tilt === "left" ? "lp-product-preview__phone--left" : "",
                    screen.tilt === "right" ? "lp-product-preview__phone--right" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <MobileAppMockup
                    variant={screen.variant}
                    size={screen.featured ? "hero" : "default"}
                    tilt={screen.tilt}
                    glow={screen.featured}
                  />
                  <figcaption className="lp-product-preview__caption">{screen.label}</figcaption>
                </figure>
              ))}
            </div>
          </div>

          <div className="lp-product-preview__bridge" aria-hidden="true">
            <span className="lp-product-preview__sync">
              <Icon name="zap" className="h-4 w-4" />
              Synced
            </span>
          </div>

          <div className="lp-product-preview__admins">
            <div className="lp-product-preview__block-label">
              <Icon name="bar-chart" className="h-4 w-4" />
              Admins
            </div>
            <DashboardMockup className="lp-product-preview__dashboard" />
          </div>
        </div>
      </Container>
    </section>
  );
}

export default ProductPreview;
