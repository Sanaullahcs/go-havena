import { Container } from "../ui/Container";
import { MobileAppMockup } from "../ui/MobileAppMockup";
import { DashboardMockup } from "../ui/DashboardMockup";
import { Icon } from "../icons/Icon";

const RESIDENT_SCREENS = [
  { variant: "feed" as const, label: "Feed", slot: "feed" as const },
  { variant: "home" as const, label: "Home", slot: "home" as const, featured: true },
  { variant: "marketplace" as const, label: "Deals", slot: "deals" as const },
  { variant: "wellness" as const, label: "Wellness", slot: "wellness" as const },
];

export function ProductPreview() {
  return (
    <section id="preview" className="lp-section lp-product-preview">
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
      </Container>

      <div className="lp-product-preview__stage">
        <div className="lp-product-preview__rail" aria-hidden="true">
          <span className="lp-product-preview__rail-label">
            <Icon name="phone" className="h-3.5 w-3.5" />
            Residents
          </span>
          <span className="lp-product-preview__rail-sync">
            <Icon name="zap" className="h-3.5 w-3.5" />
            Live sync
          </span>
          <span className="lp-product-preview__rail-label">
            <Icon name="bar-chart" className="h-3.5 w-3.5" />
            Admins
          </span>
        </div>

        <div className="lp-product-preview__canvas">
          <div className="lp-product-preview__phones" aria-label="Resident app screens">
            {RESIDENT_SCREENS.map((screen) => (
              <figure
                key={screen.slot}
                className={[
                  "lp-product-preview__phone",
                  `lp-product-preview__phone--${screen.slot}`,
                  screen.featured ? "lp-product-preview__phone--featured" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <MobileAppMockup
                  variant={screen.variant}
                  size={screen.featured ? "hero" : screen.slot === "wellness" ? "sm" : "default"}
                  glow={screen.featured}
                />
                <figcaption className="lp-product-preview__chip">{screen.label}</figcaption>
              </figure>
            ))}
          </div>

          <div className="lp-product-preview__admin">
            <DashboardMockup className="lp-product-preview__dashboard" />
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProductPreview;
