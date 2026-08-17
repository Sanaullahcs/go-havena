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
    <section id="preview" className="lp-section lp-product-preview relative overflow-x-clip">
      <div aria-hidden="true" className="soft-section absolute inset-0 -z-20" />

      <Container size="xl">
        <div className="lp-product-preview__hero">
          <div className="lp-product-preview__copy">
            <span className="section-label">Product preview</span>
            <h2 className="lp-product-preview__title section-title mt-3">
              One platform.{" "}
              <span className="gradient-text">Four resident experiences.</span>
            </h2>
            <p className="lp-product-preview__lead">
              Feed, home, deals, and wellness — synced live with your admin dashboard.
            </p>
            <ul className="lp-product-preview__experiences" aria-label="Resident experiences">
              {RESIDENT_SCREENS.map((screen) => (
                <li key={screen.slot} className="lp-product-preview__experience">
                  {screen.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="lp-product-preview__showcase">
            <div className="lp-product-preview__composition">
              <div className="lp-product-preview__orb lp-product-preview__orb--teal" aria-hidden="true" />
              <div className="lp-product-preview__orb lp-product-preview__orb--navy" aria-hidden="true" />

              <div className="lp-product-preview__visual">
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
                        size={
                          screen.featured
                            ? "hero"
                            : screen.slot === "wellness"
                              ? "sm"
                              : "default"
                        }
                        glow={screen.featured}
                      />
                      <figcaption className="sr-only">{screen.label}</figcaption>
                    </figure>
                  ))}
                </div>

                <div className="lp-product-preview__dashboard">
                  <DashboardMockup className="lp-product-preview__dashboard-frame" />
                </div>
              </div>

              <span className="lp-product-preview__sync" aria-hidden="true">
                <Icon name="zap" className="h-3.5 w-3.5" />
                Live sync
              </span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default ProductPreview;
