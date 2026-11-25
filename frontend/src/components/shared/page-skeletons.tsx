import { ShimmerBlock } from "@/components/shared/loaders";

function StatTileSkeleton() {
  return (
    <div className="relative flex min-h-[4.25rem] items-center gap-3 overflow-hidden rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-slate-200/80" />
      <ShimmerBlock className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <ShimmerBlock className="h-2.5 w-16" />
        <ShimmerBlock className="h-5 w-10" />
        <ShimmerBlock className="h-2 w-20" />
      </div>
    </div>
  );
}

function PanelSkeleton({ tall = false, className = "" }: { tall?: boolean; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <ShimmerBlock className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <ShimmerBlock className="h-3 w-28" />
            <ShimmerBlock className="h-2.5 w-36" />
          </div>
        </div>
        <ShimmerBlock className="h-6 w-16 rounded-full" />
      </div>
      <div className={`space-y-3 p-4 ${tall ? "min-h-[220px]" : "min-h-[160px]"}`}>
        <ShimmerBlock className={`${tall ? "h-40" : "h-28"} w-full rounded-xl`} />
        <div className="flex gap-2">
          <ShimmerBlock className="h-2.5 flex-1" />
          <ShimmerBlock className="h-2.5 w-16" />
        </div>
      </div>
    </div>
  );
}

function HeroSkeleton({ compact = true }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <ShimmerBlock className="h-2.5 w-28" />
          <ShimmerBlock className={compact ? "h-5 w-44" : "h-7 w-56"} />
          <ShimmerBlock className="h-2.5 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <ShimmerBlock className="h-7 w-14 rounded-full" />
          <ShimmerBlock className="h-7 w-28 rounded-full" />
          <ShimmerBlock className="h-8 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <div className="animate-fade-in-up space-y-4" aria-busy aria-label="Loading dashboard">
      <HeroSkeleton />
      <ShimmerBlock className="h-11 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-12">
        <PanelSkeleton tall className="xl:col-span-8" />
        <PanelSkeleton tall className="xl:col-span-4" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </div>
  );
}

export function CommunityDashboardSkeleton() {
  return (
    <div className="animate-fade-in-up space-y-4" aria-busy aria-label="Loading community dashboard">
      <HeroSkeleton />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <PanelSkeleton tall className="lg:col-span-2" />
        <PanelSkeleton tall />
      </div>
    </div>
  );
}

export function TablePageSkeleton({ tiles = 4, rows = 7 }: { tiles?: number; rows?: number }) {
  return (
    <div className="animate-fade-in-up space-y-4" aria-busy aria-label="Loading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <ShimmerBlock className="h-3 w-24" />
          <ShimmerBlock className="h-6 w-48" />
          <ShimmerBlock className="h-2.5 w-64 max-w-full" />
        </div>
        <div className="flex gap-2">
          <ShimmerBlock className="h-9 w-28 rounded-xl" />
          <ShimmerBlock className="h-9 w-24 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: tiles }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex gap-2">
            <ShimmerBlock className="h-8 w-20 rounded-lg" />
            <ShimmerBlock className="h-8 w-20 rounded-lg" />
            <ShimmerBlock className="h-8 w-24 rounded-lg" />
          </div>
          <ShimmerBlock className="h-8 w-40 rounded-lg" />
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <ShimmerBlock className="h-9 w-9 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <ShimmerBlock className="h-3 w-40 max-w-[50%]" />
                <ShimmerBlock className="h-2.5 w-56 max-w-[70%]" />
              </div>
              <ShimmerBlock className="h-6 w-16 rounded-full" />
              <ShimmerBlock className="h-8 w-8 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BillingPageSkeleton() {
  return (
    <div className="animate-fade-in-up space-y-5" aria-busy aria-label="Loading billing">
      <div className="overflow-hidden rounded-[28px] bg-[#1B4F8A] px-5 py-7 sm:px-8">
        <ShimmerBlock className="mb-3 h-6 w-24 rounded-full bg-white/20" />
        <ShimmerBlock className="mb-2 h-8 w-64 max-w-full bg-white/25" />
        <ShimmerBlock className="h-3 w-80 max-w-full bg-white/15" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <ShimmerBlock className="h-5 w-24" />
            <ShimmerBlock className="h-8 w-20" />
            <ShimmerBlock className="h-3 w-full" />
            <ShimmerBlock className="h-3 w-4/5" />
            <ShimmerBlock className="mt-4 h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardsPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="animate-fade-in-up space-y-4" aria-busy aria-label="Loading">
      <div className="space-y-1.5">
        <ShimmerBlock className="h-3 w-24" />
        <ShimmerBlock className="h-6 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <ShimmerBlock className="h-36 w-full rounded-none" />
            <div className="space-y-2 p-4">
              <ShimmerBlock className="h-4 w-3/4" />
              <ShimmerBlock className="h-3 w-full" />
              <ShimmerBlock className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div className="animate-fade-in-up mx-auto w-full max-w-xl space-y-4" aria-busy aria-label="Loading">
      <ShimmerBlock className="h-7 w-48" />
      <ShimmerBlock className="h-3 w-64 max-w-full" />
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {Array.from({ length: 5 }).map((_, i) => (
          <ShimmerBlock key={i} className="h-11 w-full rounded-xl" />
        ))}
        <ShimmerBlock className="mt-2 h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}

export type PageSkeletonVariant =
  | "dashboard"
  | "community"
  | "table"
  | "billing"
  | "cards"
  | "form";

export function PageSkeleton({ variant = "table" }: { variant?: PageSkeletonVariant }) {
  switch (variant) {
    case "dashboard":
      return <DashboardPageSkeleton />;
    case "community":
      return <CommunityDashboardSkeleton />;
    case "billing":
      return <BillingPageSkeleton />;
    case "cards":
      return <CardsPageSkeleton />;
    case "form":
      return <FormPageSkeleton />;
    default:
      return <TablePageSkeleton />;
  }
}
