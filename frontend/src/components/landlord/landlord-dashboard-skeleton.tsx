import { ShimmerBlock } from "@/components/shared/loaders";

function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <ShimmerBlock className="h-3 w-24" />
          <ShimmerBlock className="h-7 w-12" />
        </div>
        <ShimmerBlock className="h-10 w-10 shrink-0 rounded-xl" />
      </div>
      <ShimmerBlock className="mt-3 h-2.5 w-28" />
    </div>
  );
}

export function LandlordDashboardSkeleton() {
  return (
    <div className="animate-fade-in-up space-y-4" aria-busy aria-label="Loading dashboard">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <ShimmerBlock className="h-11 w-11 rounded-xl" />
            <div className="space-y-2">
              <ShimmerBlock className="h-2.5 w-16" />
              <ShimmerBlock className="h-5 w-40" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShimmerBlock className="h-8 w-28 rounded-full" />
            <ShimmerBlock className="h-8 w-24 rounded-full" />
            <ShimmerBlock className="h-8 w-36 rounded-full" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5 lg:col-span-2">
          <div className="mb-3 space-y-2">
            <ShimmerBlock className="h-4 w-32" />
            <ShimmerBlock className="h-2.5 w-52" />
          </div>
          <ShimmerBlock className="h-[250px] w-full rounded-xl" />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5">
          <div className="mb-4 space-y-2">
            <ShimmerBlock className="h-4 w-28" />
            <ShimmerBlock className="h-2.5 w-36" />
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ShimmerBlock className="h-[168px] w-[168px] shrink-0 rounded-full" />
            <div className="w-full space-y-2.5">
              {Array.from({ length: 4 }).map((_, index) => (
                <ShimmerBlock key={index} className="h-3 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="space-y-2">
            <ShimmerBlock className="h-4 w-24" />
            <ShimmerBlock className="h-2.5 w-48" />
          </div>
        </div>
        <div className="hidden grid-cols-[1.3fr_1fr_1fr_7rem] gap-3 px-5 py-2.5 sm:grid">
          <ShimmerBlock className="h-2.5 w-10" />
          <ShimmerBlock className="h-2.5 w-20" />
          <ShimmerBlock className="h-2.5 w-16" />
          <ShimmerBlock className="ml-auto h-2.5 w-16" />
        </div>
        <ul>
          {Array.from({ length: 4 }).map((_, index) => (
            <li
              key={index}
              className="grid grid-cols-2 items-center gap-3 border-t border-slate-100 px-5 py-3.5 sm:grid-cols-[1.3fr_1fr_1fr_7rem]"
            >
              <span className="flex items-center gap-2.5">
                <ShimmerBlock className="h-8 w-8 rounded-lg" />
                <ShimmerBlock className="h-3.5 w-12" />
              </span>
              <ShimmerBlock className="h-6 w-16 rounded-full" />
              <ShimmerBlock className="h-6 w-16 rounded-full" />
              <ShimmerBlock className="col-span-2 ml-auto h-7 w-[7.5rem] rounded-full sm:col-span-1" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
