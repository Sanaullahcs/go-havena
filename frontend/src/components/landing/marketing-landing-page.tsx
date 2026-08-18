"use client";

import { LandingScrollHandler } from "./LandingScrollHandler";
import { Header } from "./sections/Header";
import { Hero } from "./sections/Hero";
import { StatsStrip } from "./sections/StatsStrip";
import { ProblemSolution } from "./sections/ProblemSolution";
import { Features } from "./sections/Features";
import { ResidentsSection } from "./sections/ResidentsSection";
import { AdminsSection } from "./sections/AdminsSection";
import { SafetySection } from "./sections/SafetySection";
import { HowItWorks } from "./sections/HowItWorks";
import { CTABanner } from "./sections/CTABanner";
import { CTA } from "./sections/CTA";
import { Footer } from "./sections/Footer";

export function MarketingLandingPage() {
  return (
    <>
      <LandingScrollHandler />
      <Header />
      <main id="main">
        <Hero />
        <StatsStrip />
        <ProblemSolution />
        <Features />
        <ResidentsSection />
        <AdminsSection />
        <SafetySection />
        <HowItWorks />
        <CTABanner />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

export default MarketingLandingPage;
