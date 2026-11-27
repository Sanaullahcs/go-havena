import { ShimmerBlock } from "@/components/shared/loaders";

export function LandlordOwnedUnitsSkeleton() {
  return (
    <div className="animate-fade-in-up space-y-4" aria-busy aria-label="Loading owned units">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <ShimmerBlock className="h-11 w-11 rounded-xl" />
            <div className="space-y-2">
              <ShimmerBlock className="h-2.5 w-20" />
              <ShimmerBlock className="h-5 w-40" />
              <ShimmerBlock className="h-3 w-64" />
            </div>
          </div>
          <div className="flex gap-2">
            <ShimmerBlock className="h-8 w-28 rounded-full" />
            <ShimmerBlock className="h-8 w-24 rounded-full" />
          </div>
        </div>
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
        <div className="border-b border-slate-100 px-5 py-4">
          <ShimmerBlock className="h-4 w-32" />
          <ShimmerBlock className="mt-2 h-3 w-56" />
        </div>
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="border-t border-slate-100 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShimmerBlock className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <ShimmerBlock className="h-4 w-24" />
                  <ShimmerBlock className="h-3 w-14" />
                </div>
              </div>
              <div className="flex gap-2">
                <ShimmerBlock className="h-6 w-20 rounded-full" />
                <ShimmerBlock className="h-7 w-28 rounded-full" />
              </div>
            </div>
            <ShimmerBlock className="mt-3 h-14 w-full rounded-xl" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <ShimmerBlock className="h-4 w-36" />
          <ShimmerBlock className="mt-2 h-3 w-64" />
        </div>
        <div className="px-5 py-4">
          <ShimmerBlock className="h-4 w-40" />
          <ShimmerBlock className="mt-2 h-3 w-52" />
          <ShimmerBlock className="mt-3 h-16 w-full rounded-xl" />
          <div className="mt-3 flex gap-2">
            <ShimmerBlock className="h-8 w-20 rounded-lg" />
            <ShimmerBlock className="h-8 w-16 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
