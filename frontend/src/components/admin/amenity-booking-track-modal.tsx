"use client";

import { Calendar, Clock3, Users, X } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui";
import { AmenityIcon } from "@/components/admin/amenity-icon";
import type { Amenity } from "@/lib/api/amenities";

function formatBookingDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function bookingStatusMeta(status?: string | null) {
  if (status === "pending") return { label: "Pending approval", tone: "amber" as const, hint: "Waiting for the amenity creator to review your request." };
  if (status === "awaiting_payment") return { label: "Payment required", tone: "amber" as const, hint: "The amenity creator approved your request. Pay and submit proof to confirm the booking." };
  if (status === "rejected") return { label: "Declined", tone: "red" as const, hint: "Your booking request was declined by the amenity creator." };
  if (status === "confirmed") return { label: "Approved", tone: "green" as const, hint: "Your reservation is confirmed." };
  return { label: "Booked", tone: "blue" as const, hint: "Your reservation details are below." };
}

export function canPayAmenityBooking(amenity?: Amenity | null) {
  return amenity?.user_next_booking_status === "awaiting_payment"
    && amenity.user_next_booking_bill?.can_submit_proof === true;
}

export function AmenityBookingTrackModal({
  amenity,
  onClose,
  onPay,
}: {
  amenity: Amenity | null;
  onClose: () => void;
  onPay?: (amenity: Amenity) => void;
}) {
  if (!amenity?.user_has_upcoming_booking) return null;

  const status = bookingStatusMeta(amenity.user_next_booking_status);
  const canPay = canPayAmenityBooking(amenity);
  const bill = amenity.user_next_booking_bill;
  const awaitingReview = amenity.user_next_booking_status === "awaiting_payment"
    && bill
    && !bill.can_submit_proof;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50">
              <AmenityIcon iconKey={amenity.icon_key} name={amenity.name} size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-slate-900">Track booking</h3>
              <p className="truncate text-xs text-slate-500">{amenity.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
              <p className="mt-1 text-sm text-slate-700">
                {awaitingReview
                  ? "Payment proof submitted. Waiting for the amenity creator to approve it."
                  : status.hint}
              </p>
            </div>
            <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-100 px-4 py-3">
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
              <span>{formatBookingDate(amenity.user_next_booking_date)}</span>
            </div>
            {amenity.user_next_booking_time_slot ? (
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />
                <span>{amenity.user_next_booking_time_slot}</span>
              </div>
            ) : null}
            {amenity.user_next_booking_guests ? (
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Users className="h-4 w-4 shrink-0 text-slate-400" />
                <span>{amenity.user_next_booking_guests} guest{amenity.user_next_booking_guests === 1 ? "" : "s"}</span>
              </div>
            ) : null}
            {bill?.amount ? (
              <p className="text-sm font-semibold text-slate-800">
                Amount due: ${Number(bill.amount).toFixed(Number(bill.amount) % 1 === 0 ? 0 : 2)}
              </p>
            ) : null}
          </div>

          {amenity.creator_name ? (
            <p className="text-xs text-slate-500">
              Managed by {amenity.creator_name}. Only the amenity creator approves booking requests.
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary">
            Close
          </button>
          {canPay && onPay ? (
            <button type="button" onClick={() => onPay(amenity)} className="nl-btn-primary">
              Make payment
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
