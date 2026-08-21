"use client";

import { X } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui";
import { AmenityIcon } from "@/components/admin/amenity-icon";
import {
  getAmenityReviewMeta,
  getAmenityStatusMeta,
  getAmenityVisual,
} from "@/lib/admin/amenity-display";
import type { Amenity } from "@/lib/api/amenities";

export function AmenityViewModal({
  amenity,
  onClose,
  onEdit,
  onApprove,
  onReject,
  onManageRequests,
}: {
  amenity: Amenity | null;
  onClose: () => void;
  onEdit?: (amenity: Amenity) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onManageRequests?: () => void;
}) {
  if (!amenity) return null;

  const visual = getAmenityVisual(amenity.name, amenity.icon_key);
  const status = getAmenityStatusMeta(amenity.status);
  const review = getAmenityReviewMeta(amenity.review_status);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: visual.soft }}
            >
              <AmenityIcon iconKey={amenity.icon_key} name={amenity.name} size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-slate-900">{amenity.name}</h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {review ? <AdminBadge tone={review.tone}>{review.label}</AdminBadge> : null}
                <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm text-slate-600">
          {amenity.is_mine ? (
            <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
              This is your amenity. Booking is disabled — you can edit details and manage booking
              requests.
            </p>
          ) : amenity.creator_name ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              Created by {amenity.creator_name}. You can review or book this amenity, but only the
              creator can edit its details.
            </p>
          ) : null}
          {amenity.description ? (
            <p className="leading-relaxed text-slate-700">{amenity.description}</p>
          ) : (
            <p className="italic text-slate-400">No description provided.</p>
          )}

          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Capacity</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{amenity.capacity}</dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Location</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{amenity.floor || "—"}</dd>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hours</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{amenity.hours || "—"}</dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Weekends</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {amenity.weekends_available === false ? "Closed" : "Available"}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Slot duration</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {amenity.status === "bookable" && amenity.slot_duration_minutes
                  ? `${amenity.slot_duration_minutes} minutes`
                  : "Open access"}
              </dd>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Created by</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{amenity.creator_name || "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
          {onReject ? (
            <button
              type="button"
              onClick={onReject}
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
            >
              Reject
            </button>
          ) : null}
          {onApprove ? (
            <button
              type="button"
              onClick={onApprove}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              Approve
            </button>
          ) : null}
          {amenity.is_mine && onManageRequests ? (
            <button
              type="button"
              onClick={onManageRequests}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Manage requests
            </button>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(amenity)}
              className="rounded-xl bg-[#1B4F8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1B4F8A]"
            >
              Edit amenity
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
