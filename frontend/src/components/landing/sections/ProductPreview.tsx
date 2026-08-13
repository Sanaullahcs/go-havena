import { Container } from "../ui/Container";
import { MobileAppMockup } from "../ui/MobileAppMockup";
import { DashboardMockup } from "../ui/DashboardMockup";
import { Icon } from "../icons/Icon";

const labelClass =
  "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]";

export function ProductPreview() {
  return (
    <section id="preview" className="lp-section relative overflow-x-clip">
      <div aria-hidden="true" className="soft-section absolute inset-0 -z-20" />

      <Container size="xl">
        <div className="mx-auto max-w-xl text-center">
          <span className="section-label justify-center">Product preview</span>
          <h2 className="section-title mt-3">
            One platform.{" "}
            <span className="gradient-text">Four resident experiences.</span>
          </h2>
          <p className="mx-auto mt-2 text-[15px] leading-relaxed text-ink-body">
            Feed, home, deals, and wellness — synced live with your admin dashboard.
          </p>
        </div>

        <div className="lp-product-preview__showcase mx-auto max-w-full">
          <div className="lp-product-preview__phones">
            <div className="lp-product-preview__phone lp-product-preview__phone--left">
              <MobileAppMockup variant="feed" size="sm" tilt="left" glow={false} />
              <span className="lp-product-preview__label">Community feed</span>
            </div>
            <div className="lp-product-preview__phone lp-product-preview__phone--center">
              <MobileAppMockup variant="home" size="default" tilt="none" glow />
              <span className="lp-product-preview__label">Resident home</span>
            </div>
            <div className="lp-product-preview__phone lp-product-preview__phone--right">
              <MobileAppMockup variant="marketplace" size="sm" tilt="right" glow={false} />
              <span className="lp-product-preview__label">Local deals</span>
            </div>
          </div>
        </div>

        <div className="product-preview-stage mx-auto max-w-full">
          <div className="product-preview-labels hidden lg:grid">
            <span className={`${labelClass} justify-self-center text-brand-deep`}>
              <Icon name="phone" className="h-3.5 w-3.5" />
              Residents
            </span>
            <span aria-hidden="true" />
            <span className={`${labelClass} justify-self-center text-brand-deep`}>
              <Icon name="bar-chart" className="h-3.5 w-3.5" />
              Admins
            </span>
          </div>

          <div className="product-preview-row">
            <div className="product-preview-mobile">
              <span className={`${labelClass} mb-3 text-brand-deep lg:hidden`}>
                <Icon name="phone" className="h-3.5 w-3.5" />
                Residents
              </span>
              <MobileAppMockup variant="wellness" size="default" glow />
            </div>

            <div aria-hidden="true" className="product-preview-connector hidden lg:flex">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-brand-deep/15 bg-brand-soft text-brand-deep">
                <Icon name="zap" className="h-4 w-4" />
              </span>
              <span className="h-12 w-px bg-gradient-to-b from-brand/40 to-brand-deep/30" />
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                Synced
              </span>
            </div>

            <div className="product-preview-dashboard">
              <span className={`${labelClass} mb-3 text-brand-deep lg:hidden`}>
                <Icon name="bar-chart" className="h-3.5 w-3.5" />
                Admins
              </span>
              <DashboardMockup />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

export default ProductPreview;
