import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";
import { marketingSite } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: marketingSite.name,
  description: marketingSite.description,
};

export default function HomePage() {
  return <LandingPage />;
}
