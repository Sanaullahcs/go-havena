import { ShimmerBlock } from "@/components/shared/loaders";

export function LandlordPropertiesSkeleton() {
  return (
    <div className="animate-fade-in-up space-y-4" aria-busy aria-label="Loading properties">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <ShimmerBlock className="h-6 w-36" />
          <ShimmerBlock className="h-3 w-72" />
        </div>
        <ShimmerBlock className="h-9 w-28 rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-100 bg-white px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <ShimmerBlock className="h-3 w-24" />
                <ShimmerBlock className="h-7 w-12" />
              </div>
              <ShimmerBlock className="h-10 w-10 shrink-0 rounded-xl" />
            </div>
            <ShimmerBlock className="mt-3 h-2.5 w-28" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <ShimmerBlock className="h-4 w-28" />
            <ShimmerBlock className="mt-2 h-3 w-56" />
          </div>
          <div className="flex gap-2">
            <ShimmerBlock className="h-9 w-56 rounded-lg" />
            <ShimmerBlock className="h-9 w-32 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-6 gap-3 px-5 py-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <ShimmerBlock key={index} className="h-3 w-16" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="grid grid-cols-6 items-center gap-3 border-t border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <ShimmerBlock className="h-8 w-8 rounded-lg" />
              <ShimmerBlock className="h-4 w-14" />
            </div>
            <ShimmerBlock className="h-6 w-20 rounded-full" />
            <ShimmerBlock className="h-4 w-24" />
            <ShimmerBlock className="h-4 w-16" />
            <ShimmerBlock className="h-8 w-24 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
