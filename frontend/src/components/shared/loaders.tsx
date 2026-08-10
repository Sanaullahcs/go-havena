"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

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
    <div className="w-full space-y-5 py-2" aria-busy aria-label="Loading">
      <div className="space-y-2">
        <ShimmerBlock className="h-3 w-24" />
        <ShimmerBlock className="h-7 w-56 max-w-full" />
        <ShimmerBlock className="h-3 w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerBlock key={i} className="h-[4.25rem] rounded-xl" />
        ))}
      </div>
      <ShimmerBlock className="h-52 w-full rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <ShimmerBlock key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
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

export function AuthRedirectOverlay({
  title = "Opening your dashboard",
  subtitle = "Setting up your workspace…",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f4f6fb]/90 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="animate-fade-in-up mx-4 w-full max-w-sm">
        <div className="rounded-2xl border border-white/80 bg-white/95 p-8 shadow-xl shadow-blue-900/10">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-5">
              <span className="absolute inset-0 animate-ping rounded-2xl bg-blue-500/15" aria-hidden />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </span>
            </div>

            <p className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</p>
            <p className="mt-1.5 text-[13px] text-slate-500">{subtitle}</p>

            <div className="mt-4 flex items-center gap-2 text-blue-600">
              <RingSpinner className="h-4 w-4" tone="blue" />
              <DotPulse className="text-blue-500" />
            </div>
          </div>

          <div className="mt-7 space-y-2.5 border-t border-slate-100 pt-6">
            <ShimmerBlock className="h-2.5 w-2/3" />
            <div className="grid grid-cols-3 gap-2">
              <ShimmerBlock className="h-10 rounded-lg" />
              <ShimmerBlock className="h-10 rounded-lg" />
              <ShimmerBlock className="h-10 rounded-lg" />
            </div>
            <ShimmerBlock className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
