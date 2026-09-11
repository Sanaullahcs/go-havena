"use client";

const API_ORIGIN =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "");

function resolveUrl(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

function isPdf(url: string) {
  return /\.pdf($|\?)/i.test(url);
}

export function UtilityBillPreview({
  url,
  label = "Utility bill / lease",
  compact = false,
  reviewStatus = null,
}: {
  url?: string | null;
  label?: string;
  compact?: boolean;
  reviewStatus?: string | null;
}) {
  const resolved = resolveUrl(url);
  const needsReview = reviewStatus === "review" || reviewStatus === "pending_review";
  const reviewNote = needsReview ? (
    <p className={`text-amber-700 ${compact ? "text-[10px]" : "text-[11px]"}`}>
      Needs admin review — not auto-verified.
    </p>
  ) : null;

  if (!resolved) {
    return (
      <p className={`text-slate-400 ${compact ? "text-[11px]" : "text-[12px]"}`}>
        No document uploaded
      </p>
    );
  }

  if (isPdf(resolved)) {
    return (
      <div className={compact ? "space-y-1" : "space-y-2"}>
        <p className={`font-semibold text-slate-700 ${compact ? "text-[11px]" : "text-[12px]"}`}>{label}</p>
        {reviewNote}
        <a
          href={resolved}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-blue-700 hover:bg-blue-50"
        >
          View PDF document
        </a>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <p className={`font-semibold text-slate-700 ${compact ? "text-[11px]" : "text-[12px]"}`}>{label}</p>
      {reviewNote}
      <a href={resolved} target="_blank" rel="noopener noreferrer" className="inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolved}
          alt={label}
          className={`max-w-full rounded-lg border border-slate-200 object-contain ${compact ? "max-h-28" : "max-h-48"}`}
        />
      </a>
    </div>
  );
}
