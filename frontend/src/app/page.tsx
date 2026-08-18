import type { Metadata } from "next";
import { MarketingLandingPage } from "@/components/landing/marketing-landing-page";
import { site } from "@/lib/landing/site";

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
};

export default function HomePage() {
  return (
    <div className="landing-page lp lp--breeze min-h-screen overflow-x-hidden text-ink-primary antialiased">
      <MarketingLandingPage />
    </div>
  );
}
