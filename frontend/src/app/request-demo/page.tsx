import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { DemoRequestForm } from "@/components/marketing/demo-request-form";

export const metadata: Metadata = {
  title: "Request a demo",
  description:
    "Book a Havena walkthrough for your community. See notices, membership, and engagement tools in action.",
};

const DEMO_POINTS = [
  "Live walkthrough of the community admin dashboard",
  "Notices, membership, and resident engagement flows",
  "Guidance on plans, seats, and rollout for your community",
] as const;

export default function RequestDemoPage() {
  return (
    <div className="marketing-landing min-h-screen">
      <MarketingHeader />
      <main className="lp-demo">
        <div className="lp-container lp-demo__layout">
          <aside className="lp-demo__aside">
            <p className="lp-eyebrow">Demo</p>
            <h1 className="lp-h2 mt-3">See Havena with your community in mind.</h1>
            <p className="lp-demo__lead">
              Tell us a little about your community and we will schedule a focused walkthrough.
              No pressure, no long sales call.
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
              <p>Usually we reply within one business day.</p>
            </div>
            <DemoRequestForm />
          </section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
