import type { AdminDashboardStats } from "@/lib/api/dashboard";

export type PendingReviewCategory = {
  key: string;
  label: string;
  count: number;
};

/** Community-admin pending counts included in `pending_approval_total`. */
export function communityPendingReviewCategories(
  stats: Pick<
    AdminDashboardStats,
    | "pending_members"
    | "pending_listings"
    | "pending_posts"
    | "pending_bookings"
    | "pending_businesses"
    | "pending_amenity_reviews"
    | "pending_amenity_payments"
    | "pending_service_payments"
    | "pending_unit_requests"
  >,
): PendingReviewCategory[] {
  return [
    { key: "members", label: "Members", count: stats.pending_members },
    { key: "unit_requests", label: "Unit requests", count: stats.pending_unit_requests ?? 0 },
    { key: "listings", label: "Listings", count: stats.pending_listings ?? 0 },
    { key: "posts", label: "Posts", count: stats.pending_posts },
    { key: "bookings", label: "Bookings", count: stats.pending_bookings ?? 0 },
    { key: "amenities", label: "Amenities", count: stats.pending_amenity_reviews ?? 0 },
    { key: "amenity_bills", label: "Amenity bills", count: stats.pending_amenity_payments ?? 0 },
    { key: "service_bills", label: "Service bills", count: stats.pending_service_payments ?? 0 },
    { key: "businesses", label: "Businesses", count: stats.pending_businesses ?? 0 },
  ];
}

/** Non-zero categories when anything is pending; otherwise the full breakdown (all zeros). */
export function pendingReviewCategoriesForDisplay(
  stats: Pick<
    AdminDashboardStats,
    | "pending_approval_total"
    | "pending_members"
    | "pending_listings"
    | "pending_posts"
    | "pending_bookings"
    | "pending_businesses"
    | "pending_amenity_reviews"
    | "pending_amenity_payments"
    | "pending_service_payments"
    | "pending_unit_requests"
  >,
): PendingReviewCategory[] {
  const all = communityPendingReviewCategories(stats);
  if (stats.pending_approval_total <= 0) return all;
  const active = all.filter((row) => row.count > 0);
  return active.length > 0 ? active : all;
}

export function PendingReviewBreakdown({
  stats,
}: {
  stats: Pick<
    AdminDashboardStats,
    | "pending_approval_total"
    | "pending_members"
    | "pending_listings"
    | "pending_posts"
    | "pending_bookings"
    | "pending_businesses"
    | "pending_amenity_reviews"
    | "pending_amenity_payments"
    | "pending_service_payments"
    | "pending_unit_requests"
  >;
}) {
  if (stats.pending_approval_total <= 0) {
    return <span className="text-[11px] leading-snug">Nothing awaiting review</span>;
  }

  const rows = pendingReviewCategoriesForDisplay(stats);

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[11px] leading-snug">
      {rows.map((row, index) => (
        <span key={row.key} className="inline-flex items-baseline whitespace-nowrap">
          {index > 0 ? (
            <span className="px-1 font-normal text-slate-300" aria-hidden>
              |
            </span>
          ) : null}
          <span className="font-semibold text-slate-700">{row.label}:</span>
          <span className="ml-1 tabular-nums font-medium text-slate-600">{row.count}</span>
        </span>
      ))}
    </div>
  );
}
