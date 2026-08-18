import type { Metadata } from "next";
import { MarketingLandingPage } from "@/components/landing/marketing-landing-page";
import { site } from "@/lib/landing/site";

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
};

export default function LandingPage() {
  return <MarketingLandingPage />;
}
