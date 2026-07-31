"use client";

import { Header } from "@/components/landing/sections/Header";
import { Hero } from "@/components/landing/sections/Hero";
import { BenefitsRow } from "@/components/landing/sections/BenefitsRow";
import { Features } from "@/components/landing/sections/Features";
import { HowItWorks } from "@/components/landing/sections/HowItWorks";
import { ProductPreview } from "@/components/landing/sections/ProductPreview";
import { TrustBanners } from "@/components/landing/sections/TrustBanners";
import { CTA } from "@/components/landing/sections/CTA";
import { Footer } from "@/components/landing/sections/Footer";
import { Reveal } from "@/components/landing/ui/Reveal";
import { LandingScrollHandler } from "@/components/landing/LandingScrollHandler";

export default function LandingPage() {
  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-white text-ink-primary antialiased">
      <LandingScrollHandler />
      <Header />
      <main id="main">
        <Hero />
        <Reveal>
          <BenefitsRow />
        </Reveal>
        <Reveal delay={80}>
          <ProductPreview />
        </Reveal>
        <Reveal delay={80}>
          <Features />
        </Reveal>
        <Reveal delay={80}>
          <HowItWorks />
        </Reveal>
        <Reveal delay={80}>
          <TrustBanners />
        </Reveal>
        <Reveal delay={80}>
          <CTA />
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
