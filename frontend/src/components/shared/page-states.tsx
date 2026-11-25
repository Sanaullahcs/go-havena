"use client";

import { DotPulse, RingSpinner } from "@/components/shared/loaders";
import { MinimalStatusCenter } from "@/components/shared/minimal-status-center";
import { PageSkeleton, type PageSkeletonVariant } from "@/components/shared/page-skeletons";

export function PageLoader({
  text = "Loading…",
  skeleton = true,
  variant = "table",
}: {
  text?: string;
  skeleton?: boolean;
  variant?: PageSkeletonVariant;
}) {
  if (skeleton) {
    return (
      <div className="w-full" aria-busy aria-label={text}>
        <PageSkeleton variant={variant} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 py-8" role="status" aria-live="polite">
      <div className="relative">
        <span className="absolute inset-0 animate-ping rounded-full bg-blue-500/10" aria-hidden />
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-slate-200/80">
          <RingSpinner className="h-5 w-5" tone="blue" />
        </span>
      </div>
      <div className="text-center">
        <p className="text-[13.5px] font-medium text-slate-700">{text}</p>
        <DotPulse className="mt-2 justify-center text-blue-500" />
      </div>
    </div>
  );
}

export function PageOffline({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex min-h-[min(420px,calc(100dvh-12rem))] w-full items-center justify-center bg-[#F8F9FA]">
      <MinimalStatusCenter
        title="No Internet Connection"
        description="Your device appears to be offline. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => {
          if (onRetry) onRetry();
        }}
      />
    </div>
  );
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7v5M12 15h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-[13px] font-semibold text-slate-700">Something went wrong</p>
        <p className="mt-0.5 text-[12px] text-slate-400">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry}
          className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, sub, icon }: { title: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <div>
        <p className="text-[13.5px] font-semibold text-slate-700">{title}</p>
        {sub && <p className="mt-0.5 text-[12px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}
