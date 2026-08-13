import type { Metadata } from "next";
import { MarketingLandingPage } from "@/components/landing/marketing-landing-page";

export const metadata: Metadata = {
  title: "Havena — Your neighborhood, connected",
  description:
    "Havena is the community platform for HOAs and neighborhoods — subscribe once, invite residents, and run notices, amenities, wellness, and local life in one place.",
};

export default function LandingPage() {
  return <MarketingLandingPage />;
}
