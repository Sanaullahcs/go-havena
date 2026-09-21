import * as React from "react";
import { Header } from "@/components/sections/Header";
import { Hero } from "@/components/sections/Hero";
import { BenefitsRow } from "@/components/sections/BenefitsRow";
import { Features } from "@/components/sections/Features";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Testimonials } from "@/components/sections/Testimonials";
import { CTA } from "@/components/sections/CTA";
import { Footer } from "@/components/sections/Footer";

export default function Page() {
    return (
        <>
            <Header />
            <main id="main">
                <Hero />
                <BenefitsRow />
                <Features />
                <HowItWorks />
                <Testimonials />
                <CTA />
            </main>
            <Footer />
        </>
    );
}
