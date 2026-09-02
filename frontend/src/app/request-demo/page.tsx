import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { DemoRequestForm } from "@/components/marketing/demo-request-form";

export const metadata: Metadata = {
  title: "Request a demo",
  description: "A focused walkthrough of the Havena admin dashboard and resident app.",
};

const DEMO_POINTS = [
  "Admin dashboard for members, notices, and activity",
  "Resident app for feed, deals, and amenities",
  "How seat plans and billing work for the board",
] as const;

export default function RequestDemoPage() {
  return (
    <div className="marketing-landing min-h-screen">
      <MarketingHeader />
      <main className="lp-demo">
        <div className="lp-container lp-demo__layout">
          <aside className="lp-demo__aside">
            <p className="lp-eyebrow">A conversation, not a pitch</p>
            <h1 className="lp-h2 mt-3">See Havena with your community in mind.</h1>
            <p className="lp-demo__lead">
              Thirty minutes on the admin dashboard and resident app. We reply within one business day.
            </p>
            <ul className="lp-demo__points">
              {DEMO_POINTS.map((item) => (
                <li key={item}>
                  <span className="lp-demo__check" aria-hidden>
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="lp-demo__aside-note">
              Prefer email?{" "}
              <a href="https://mail.google.com/mail/?view=cm&fs=1&to=hello%40gohavena.com" target="_blank" rel="noopener noreferrer">
                hello@gohavena.com
              </a>
            </p>
            <Link href="/" className="lp-legal__back">
              ← Back to home
            </Link>
          </aside>

          <section className="lp-demo__panel" aria-label="Demo request form">
            <div className="lp-demo__panel-head">
              <h2>Request a demo</h2>
              <p>We typically reply within one business day.</p>
            </div>
            <DemoRequestForm />
          </section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
