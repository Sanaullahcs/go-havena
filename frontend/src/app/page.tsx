import type { Metadata } from "next";
import Link from "next/link";
import { HavenaMark } from "@/components/shared/havena-mark";

export const metadata: Metadata = {
  title: "Havena",
  description: "Sign in to manage your community or create a new admin account.",
};

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#1B4F8A] px-5 py-6 text-white sm:px-8">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          <HavenaMark size={36} tone="light" />
          <span className="font-[family-name:var(--font-brand)] text-[1.15rem] font-semibold tracking-tight">
            Havena
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/privacy-policy"
            className="hidden rounded-xl px-2 py-2 text-[13px] font-semibold text-white/80 underline underline-offset-2 transition hover:text-white sm:inline"
          >
            Privacy
          </Link>
          <Link
            href="/terms-of-service"
            className="hidden rounded-xl px-2 py-2 text-[13px] font-semibold text-white/80 underline underline-offset-2 transition hover:text-white sm:inline"
          >
            Terms
          </Link>
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
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center text-center">
        <HavenaMark size={56} tone="light" />
        <h1 className="mt-6 font-[family-name:var(--font-brand)] text-[2.4rem] font-bold leading-none tracking-tight sm:text-[3rem]">
          Havena
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-white/70">
          Community admin access. Sign in or create an account to set up your neighborhood.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-[#1B4F8A] shadow-sm transition hover:bg-slate-50"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-white/25 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Sign up
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-white/65">
          <Link href="/resident-login" className="hover:text-white">
            Resident portal
          </Link>
          <Link href="/plans" className="hover:text-white">
            View plans
          </Link>
          <Link href="/privacy-policy" className="hover:text-white">
            Privacy Policy
          </Link>
          <Link href="/terms-of-service" className="hover:text-white">
            Terms of Service
          </Link>
        </div>
      </main>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-4 text-[13px] text-white/70">
        <Link href="/privacy-policy" className="underline underline-offset-2 hover:text-white">
          Privacy Policy
        </Link>
        <span aria-hidden="true" className="text-white/35">
          ·
        </span>
        <Link href="/terms-of-service" className="underline underline-offset-2 hover:text-white">
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
