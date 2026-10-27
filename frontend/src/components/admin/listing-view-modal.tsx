"use client";

import type { ReactNode } from "react";
import { AdminBadge } from "@/components/admin/ui";
import { MemberUnitsLabel } from "@/components/admin/member-units-label";
import type { Listing } from "@/lib/api/listings";
import { formatCommunityMoney } from "@/lib/money";

const STATUS_META: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  approved: { label: "Active", tone: "green" },
  active: { label: "Active", tone: "green" },
  pending: { label: "Pending", tone: "amber" },
  rejected: { label: "Rejected", tone: "red" },
  sold: { label: "Sold", tone: "slate" },
};

const TYPE_LABEL: Record<string, string> = {
  for_sale: "For Sale",
  service: "Service",
  deal: "Deal",
};

const CAT_COLOR: Record<string, string> = {
  services: "#7c3aed",
  electronics: "#1B4F8A",
  furniture: "#d97706",
  vehicles: "#0891b2",
  food: "#059669",
  other: "#64748b",
  sale: "#7c3aed",
  for_sale: "#7c3aed",
  service: "#0891b2",
  deal: "#059669",
};

type Props = {
  listing: Listing | null;
  onClose: () => void;
};

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <span className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-right text-[13.5px] font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default function ListingViewModal({ listing, onClose }: Props) {
  if (!listing) return null;

  const st = STATUS_META[listing.status] ?? STATUS_META.pending;
  const catColor = CAT_COLOR[listing.type?.toLowerCase()] ?? CAT_COLOR[listing.category?.toLowerCase() ?? ""] ?? "#64748b";
  const images = listing.images ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex h-6 items-center rounded-full px-3 text-[11px] font-semibold text-white"
                  style={{ background: catColor }}
                >
                  {TYPE_LABEL[listing.type] ?? listing.type}
                </span>
                <AdminBadge tone={st.tone}>{st.label}</AdminBadge>
              </div>
              <h3 className="mt-2 text-xl font-bold text-slate-900">{listing.title}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Posted {new Date(listing.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M4 4l8 8M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {images.length > 0 ? (
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {images.map((src, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${src}-${index}`}
                  src={src}
                  alt=""
                  className="aspect-[4/3] w-full rounded-xl border border-slate-200 object-cover"
                />
              ))}
            </div>
          ) : (
            <div className="mb-5 flex aspect-[16/7] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              No photos attached
            </div>
          )}

          <p className="text-2xl font-bold text-slate-900">
            {listing.price != null ? formatCommunityMoney(listing.price) : "Contact for price"}
          </p>

          {listing.description ? (
            <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-600">
              {listing.description}
            </p>
          ) : null}

          <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 px-4">
            <DetailRow label="Category" value={listing.category ?? "—"} />
            <DetailRow label="Condition" value={listing.condition ?? "—"} />
            <DetailRow label="Location" value={listing.location ?? "—"} />
            <DetailRow label="Seller" value={listing.seller_name ?? "—"} />
            <DetailRow
              label="Unit"
              value={
                <MemberUnitsLabel
                  sellerUnits={listing.seller_units}
                  sellerUnit={listing.seller_unit}
                  empty="—"
                />
              }
            />
          </div>
        </div>

        <div className="border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary w-full justify-center">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
