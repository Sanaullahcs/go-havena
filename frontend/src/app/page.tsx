import type { Metadata } from "next";
import { ComingSoon } from "@/components/landing/sections/ComingSoon";

export const metadata: Metadata = {
  title: "Havena — Coming soon",
  description: "Havena is coming soon. A calmer home for community life.",
};

export default function LandingPage() {
  return (
    <div className="landing-page lp lp--breeze lp--coming-soon min-h-screen overflow-x-hidden text-ink-primary antialiased">
      <ComingSoon />
    </div>
  );
}
