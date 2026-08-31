import { MarketingHeader } from "@/components/marketing/header";
import { MarketingHero } from "@/components/marketing/hero";
import {
  MarketingFeatures,
  MarketingPeopleGrid,
} from "@/components/marketing/sections";
import {
  MarketingCtaBanner,
  MarketingTestimonials,
  MarketingTrustSection,
} from "@/components/marketing/trust-testimonials";
import { MarketingFooter } from "@/components/marketing/footer";

export function LandingPage() {
  return (
    <div className="marketing-landing min-h-screen">
      <MarketingHeader />
      <main>
        <MarketingHero />
        <MarketingFeatures />
        <MarketingPeopleGrid />
        <MarketingTrustSection />
        <MarketingTestimonials />
        <MarketingCtaBanner />
      </main>
      <MarketingFooter />
    </div>
  );
}
