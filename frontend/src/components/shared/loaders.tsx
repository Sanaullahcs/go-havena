"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { HavenaMark } from "@/components/shared/havena-mark";

const shimmer =
  "animate-skeleton bg-gradient-to-r from-slate-200/90 via-slate-100 to-slate-200/90 bg-[length:200%_100%]";

export function ShimmerBlock({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg ${shimmer} ${className}`} aria-hidden />;
}

export function RingSpinner({ className = "h-5 w-5", tone = "blue" }: { className?: string; tone?: "blue" | "white" | "slate" }) {
  const border =
    tone === "white"
      ? "border-white/30 border-t-white"
      : tone === "slate"
        ? "border-slate-200 border-t-slate-500"
        : "border-blue-200 border-t-blue-600";

  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-2 ${border} ${className}`}
      aria-hidden
    />
  );
}

export function DotPulse({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-80"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: "0.9s" }}
        />
      ))}
    </span>
  );
}

type LoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingText?: ReactNode;
  spinnerTone?: "blue" | "white" | "slate";
};

export function LoadingButton({
  loading = false,
  loadingText,
  spinnerTone = "white",
  children,
  className = "",
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <button {...props} disabled={disabled || loading} className={className}>
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2.5">
          <RingSpinner className="h-4 w-4" tone={spinnerTone} />
          <span>{loadingText ?? children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function InlineLoader({ text, className = "" }: { text?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[13px] text-slate-500 ${className}`}>
      <RingSpinner className="h-4 w-4" tone="slate" />
      {text ? <span>{text}</span> : null}
    </span>
  );
}

export function PageLoaderSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="w-full space-y-4 py-1" aria-busy aria-label="Loading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <ShimmerBlock className="h-3 w-24" />
          <ShimmerBlock className="h-6 w-48 max-w-full" />
          <ShimmerBlock className="h-3 w-40" />
        </div>
        <ShimmerBlock className="h-9 w-28 rounded-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerBlock key={i} className="h-[4.25rem] rounded-xl" />
        ))}
      </div>
      <ShimmerBlock className="h-44 w-full rounded-2xl" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <ShimmerBlock key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Lightweight loader for community-admin onboarding — no dashboard sidebar. */
export function AdminOnboardingShellSkeleton() {
  return (
    <div className="min-h-screen bg-[#F6F8FB]" aria-busy aria-label="Loading setup">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="space-y-2">
            <ShimmerBlock className="h-3 w-16" />
            <ShimmerBlock className="h-5 w-36" />
          </div>
          <ShimmerBlock className="h-8 w-20 rounded-lg" />
        </div>
      </header>
      <main className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">
        <ShimmerBlock className="mb-2 h-3 w-24" />
        <ShimmerBlock className="mb-4 h-8 w-64" />
        <ShimmerBlock className="mb-6 h-4 w-full max-w-md" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ShimmerBlock key={i} className="h-11 w-full rounded-xl" />
            ))}
            <ShimmerBlock className="mt-2 h-11 w-full rounded-xl" />
          </div>
        </div>
      </main>
    </div>
  );
}

export function AuthShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-[#F6F8FB]" aria-busy aria-label="Loading portal">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200/80 bg-white p-4 md:block">
        <ShimmerBlock className="mb-6 h-9 w-36" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <ShimmerBlock key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white px-5">
          <ShimmerBlock className="h-8 w-8 rounded-lg md:hidden" />
          <ShimmerBlock className="h-4 w-32" />
          <div className="ml-auto flex gap-2">
            <ShimmerBlock className="h-8 w-8 rounded-full" />
            <ShimmerBlock className="h-8 w-24 rounded-lg" />
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-5 sm:px-5 sm:py-6 lg:px-6">
          <PageLoaderSkeleton />
        </main>
      </div>
    </div>
  );
}

type AuthRedirectVariant = "community" | "community-setup" | "system" | "resident";

const REDIRECT_STEPS: Record<AuthRedirectVariant, [string, string, string]> = {
  community: ["Signed in", "Dashboard", "Your community"],
  "community-setup": ["Account ready", "Community setup", "Invite residents"],
  system: ["Signed in", "Platform dashboard", "Communities"],
  resident: ["Signed in", "Resident portal", "Notices & feed"],
};

export function AuthRedirectOverlay({
  title = "Opening your dashboard",
  subtitle = "Setting up your workspace…",
  variant = "community",
}: {
  title?: string;
  subtitle?: string;
  variant?: AuthRedirectVariant;
}) {
  const steps = REDIRECT_STEPS[variant] ?? REDIRECT_STEPS.community;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#F6F8FB]/92 px-4 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-16 top-16 h-56 w-56 rounded-full bg-[#1B4F8A]/8 blur-3xl" />
        <div className="absolute -right-10 bottom-10 h-64 w-64 rounded-full bg-teal-200/30 blur-3xl" />
      </div>

      <div className="animate-fade-in-up relative w-full max-w-[22rem]">
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_60px_-28px_rgba(27,79,138,0.45)]">
          <div className="h-1.5 bg-gradient-to-r from-[#1B4F8A] via-[#163A66] to-teal-500" aria-hidden />

          <div className="px-6 pb-6 pt-7 sm:px-7">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-5">
                <span className="absolute -inset-2 animate-ping rounded-[18px] bg-[#1B4F8A]/12" aria-hidden />
                <HavenaMark size={52} className="relative shadow-md shadow-[#1B4F8A]/25" />
              </div>

              <p className="font-[family-name:var(--font-brand)] text-[1.35rem] font-bold leading-tight tracking-tight text-slate-900">
                {title}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{subtitle}</p>

              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#E8F0F7] px-3 py-1.5 text-[#1B4F8A]">
                <RingSpinner className="h-3.5 w-3.5" tone="blue" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Just a moment</span>
              </div>
            </div>

            <ol className="mt-7 grid grid-cols-3 gap-2" aria-hidden>
              {steps.map((label, index) => {
                const state = index === 0 ? "done" : index === 1 ? "active" : "next";
                return (
                  <li
                    key={label}
                    className={[
                      "rounded-2xl px-2 py-2.5 text-center ring-1",
                      state === "done"
                        ? "bg-[#E8F0F7] ring-[#1B4F8A]/15"
                        : state === "active"
                          ? "bg-[#1B4F8A] ring-[#1B4F8A] shadow-sm shadow-[#1B4F8A]/25"
                          : "bg-slate-50 ring-slate-200/80",
                    ].join(" ")}
                  >
                    <p
                      className={[
                        "text-[10px] font-bold uppercase tracking-[0.12em]",
                        state === "active" ? "text-teal-100" : "text-slate-400",
                      ].join(" ")}
                    >
                      {index + 1}
                    </p>
                    <p
                      className={[
                        "mt-1 text-[11px] font-semibold leading-snug",
                        state === "done"
                          ? "text-[#1B4F8A]"
                          : state === "active"
                            ? "text-white"
                            : "text-slate-400",
                      ].join(" ")}
                    >
                      {label}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
