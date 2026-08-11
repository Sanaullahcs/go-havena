"use client";

import { Header } from "@/components/landing/sections/Header";
import { Hero } from "@/components/landing/sections/Hero";
import { AboutSection } from "@/components/landing/sections/AboutSection";
import { HowItWorks } from "@/components/landing/sections/HowItWorks";
import { Pricing } from "@/components/landing/sections/Pricing";
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
    <div className="landing-page lp lp--breeze min-h-screen overflow-x-hidden bg-[var(--lp-canvas)] text-ink-primary antialiased">
      <LandingScrollHandler />
      <Header />
      <main id="main">
        <Hero />
        <Reveal>
          <AboutSection />
        </Reveal>
        <Reveal delay={40}>
          <HowItWorks />
        </Reveal>
        <Reveal delay={40}>
          <Pricing />
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
