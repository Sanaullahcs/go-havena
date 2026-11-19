"use client";

import type { AdminPost } from "@/lib/api/posts";

const ROW_BLOCK_CLASS = "flex min-h-[3.5rem] w-full min-w-0 items-center py-0.5";

/** Resident report counts and progress — separate from publication status. */
export function FeedPostReportsCell({ post }: { post: AdminPost }) {
  const pendingCount = post.resident_reports_count ?? 0;
  const threshold = post.sensitive_report_threshold ?? 3;
  const untilSensitive = post.reports_until_sensitive ?? Math.max(0, threshold - pendingCount);
  const progressPct = threshold > 0 ? Math.min(100, Math.round((pendingCount / threshold) * 100)) : 0;
  const pending =
    !post.reports_restricted && pendingCount > 0 && !post.is_sensitive;

  if (post.reports_restricted) {
    return (
      <div className={ROW_BLOCK_CLASS}>
        <span className="text-[12px] text-slate-400">—</span>
      </div>
    );
  }

  if (!pending && pendingCount === 0) {
    return (
      <div className={ROW_BLOCK_CLASS}>
        <span className="text-[12px] text-slate-400">None</span>
      </div>
    );
  }

  if (!pending && post.is_sensitive && pendingCount > 0) {
    return (
      <div className={ROW_BLOCK_CLASS}>
        <span className="text-[12px] font-medium tabular-nums text-slate-600">
          {pendingCount}/{threshold} resident
        </span>
      </div>
    );
  }

  if (!pending) {
    return (
      <div className={ROW_BLOCK_CLASS}>
        <span className="text-[12px] text-slate-400">—</span>
      </div>
    );
  }

  return (
    <div className={ROW_BLOCK_CLASS}>
      <div className="w-full min-w-0 max-w-[200px]">
        <div className="flex items-center justify-between gap-2 text-[11px] leading-4">
          <span className="font-semibold text-red-700">Pending review</span>
          <span className="shrink-0 tabular-nums font-bold text-slate-800">
            {pendingCount}/{threshold}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
          <div
            className="h-full rounded-full bg-amber-400"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-1 text-[10.5px] leading-4 text-slate-500">
          {untilSensitive > 0
            ? `${untilSensitive} until sensitive`
            : "At threshold"}
        </p>
      </div>
    </div>
  );
}
