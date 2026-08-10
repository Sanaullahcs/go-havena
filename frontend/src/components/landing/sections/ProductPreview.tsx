import { Container } from "../ui/Container";
import { MobileAppMockup } from "../ui/MobileAppMockup";
import { DashboardMockup } from "../ui/DashboardMockup";
import { Icon } from "../icons/Icon";

const labelClass =
  "inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]";

export function ProductPreview() {
  return (
    <section id="preview" className="relative overflow-x-clip py-16 sm:py-20 lg:py-24">
      <div aria-hidden="true" className="soft-section absolute inset-0 -z-20" />

      <Container size="xl">
        <div className="mx-auto max-w-xl text-center">
          <span className="section-label justify-center">Product preview</span>
          <h2 className="section-title mt-4">
            One platform.{" "}
            <span className="gradient-text">Two experiences.</span>
          </h2>
          <p className="mx-auto mt-3 text-[15px] leading-relaxed text-ink-body">
            Same data across the resident mobile app and admin web dashboard.
          </p>
        </div>

        <div className="product-preview-stage mx-auto mt-12 max-w-full lg:mt-14">
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
              <MobileAppMockup />
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
