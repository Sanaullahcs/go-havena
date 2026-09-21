"use client";

import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

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

/** Top indeterminate bar for table / dashboard refresh states. */
export function TableProgressBar() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px] overflow-hidden bg-slate-100/80"
      role="progressbar"
      aria-label="Loading"
    >
      <div className="nl-table-progress-bar h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#1B4F8A] to-[#38BDF8] shadow-[0_0_10px_rgba(43,127,212,0.45)]" />
    </div>
  );
}

const TABLE_SPINNER_SIZES = {
  sm: { px: 28, stroke: 2.5, arc: 0.62 },
  md: { px: 36, stroke: 3, arc: 0.68 },
  lg: { px: 44, stroke: 3.5, arc: 0.72 },
} as const;

/** Borderless brand spinner for list and dashboard overlays. */
export function TableLoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const gradId = useId().replace(/:/g, "");
  const { px, stroke, arc } = TABLE_SPINNER_SIZES[size];
  const center = px / 2;
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * arc;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: px, height: px }}
      role="status"
      aria-label="Loading"
    >
      <span
        className="nl-table-spinner-glow absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(27,79,138,0.14) 0%, transparent 68%)" }}
        aria-hidden
      />

      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        className="relative"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#163A66" />
            <stop offset="45%" stopColor="#1B4F8A" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>

        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#E8EEF4"
          strokeWidth={stroke}
        />

        <g className="nl-table-spinner-orbit" style={{ transformOrigin: `${center}px ${center}px` }}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
            strokeDashoffset={circumference * 0.12}
          />
        </g>
      </svg>
    </div>
  );
}

/** Full-area overlay: progress bar + centered spinner (no text, no border, no blur). */
export function TableLoadingOverlay({
  minHeight = "12rem",
  spinner = true,
}: {
  minHeight?: string;
  /** When false, only the top progress bar is shown (lighter UX for search debounce). */
  spinner?: boolean;
}) {
  return (
    <>
      <TableProgressBar />
      {spinner ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-white/35"
          style={{ minHeight }}
        >
          <TableLoadingSpinner />
        </div>
      ) : null}
    </>
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

