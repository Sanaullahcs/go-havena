import type { Metadata } from "next";
import Link from "next/link";
import { Pricing } from "@/components/landing/sections/Pricing";
import { PlansHero } from "@/components/landing/sections/PlansHero";
import { Logo } from "@/components/landing/ui/Logo";

export const metadata: Metadata = {
  title: "Plans & pricing",
  description:
    "Compare Havena seat plans. Community admins subscribe once — residents never pay Havena.",
};

export default function PlansPage() {
  return (
    <div className="landing-page lp lp--breeze min-h-screen overflow-x-hidden bg-[#F6F8FB] text-slate-900">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <Link href="/" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/50">
            <Logo tone="light" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-xl px-3 py-2 text-[13px] font-semibold text-white/85 transition hover:text-white sm:px-4"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-[13px] font-semibold text-[#1B4F8A] shadow-sm transition hover:bg-slate-50"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main>
        <PlansHero />
        <Pricing hideIntro />
      </main>
    </div>
  );
}
