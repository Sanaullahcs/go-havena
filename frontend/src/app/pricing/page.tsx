import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingPricing } from "@/components/marketing/home-pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Havena subscription plans for communities of every size. The community pays Havena. Residents do not.",
};

export default function PricingPage() {
  return (
    <div className="marketing-landing min-h-screen bg-[#F7F9FC]">
      <MarketingHeader />
      <main>
        <MarketingPricing />
      </main>
      <MarketingFooter />
    </div>
  );
}
