"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { OnboardingProgress } from "@/components/admin/onboarding/onboarding-ui";

function HavenaMark() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0A2A43] shadow-sm">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"
          stroke="white"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M9 21V12h6v9" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function AdminOnboardingTopBar({
  title,
  step,
  onSignOut,
  wide = false,
}: {
  title: string;
  step: number | null;
  onSignOut: () => void;
  wide?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 w-full overflow-x-hidden border-b border-slate-200/90 bg-white/95 shadow-sm shadow-slate-900/[0.03] backdrop-blur-sm">
      <div
        className={[
          "mx-auto flex w-full min-w-0 items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3",
          wide ? "max-w-6xl" : "max-w-3xl",
        ].join(" ")}
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-lg outline-none ring-teal-500/30 focus-visible:ring-2"
        >
          <HavenaMark />
          <span className="hidden text-[13px] font-bold tracking-tight text-slate-900 sm:inline">
            Havena
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center self-stretch py-0.5">
          {step !== null ? (
            <OnboardingProgress current={step} embedded />
          ) : (
            <p className="truncate text-[13px] font-semibold leading-normal text-slate-700">{title}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onSignOut}
          aria-label="Sign out"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 sm:px-3 sm:py-1.5 sm:text-[13px]"
        >
          <LogOut className="h-3.5 w-3.5 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
