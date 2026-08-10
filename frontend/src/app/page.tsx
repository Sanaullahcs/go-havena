"use client";

import { Header } from "@/components/landing/sections/Header";
import { Hero } from "@/components/landing/sections/Hero";
import { StatsStrip } from "@/components/landing/sections/StatsStrip";
import { AboutSection } from "@/components/landing/sections/AboutSection";
import { HowItWorks } from "@/components/landing/sections/HowItWorks";
import { Features } from "@/components/landing/sections/Features";
import { Testimonials } from "@/components/landing/sections/Testimonials";
import { FAQ } from "@/components/landing/sections/FAQ";
import { CTABanner } from "@/components/landing/sections/CTABanner";
import { CTA } from "@/components/landing/sections/CTA";
import { Footer } from "@/components/landing/sections/Footer";
import { Reveal } from "@/components/landing/ui/Reveal";
import { LandingScrollHandler } from "@/components/landing/LandingScrollHandler";

export default function LandingPage() {
  return (
    <div className="landing-page lp min-h-screen overflow-x-hidden bg-white text-ink-primary antialiased">
      <LandingScrollHandler />
      <Header />
      <main id="main">
        <Hero />
        <StatsStrip />
        <Reveal>
          <AboutSection />
        </Reveal>
        <Reveal delay={40}>
          <HowItWorks />
        </Reveal>
        <Reveal delay={40}>
          <Features />
        </Reveal>
        <Reveal delay={40}>
          <Testimonials />
        </Reveal>
        <Reveal delay={40}>
          <FAQ />
        </Reveal>
        <CTABanner />
        <Reveal delay={40}>
          <CTA />
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
