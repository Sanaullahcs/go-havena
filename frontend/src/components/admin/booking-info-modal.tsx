"use client";

import { Building2, Calendar, Clock3, User, Users, X } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui";
import { AmenityIcon } from "@/components/admin/amenity-icon";
import { MemberUnitsLabel } from "@/components/admin/member-units-label";
import type { Booking } from "@/lib/api/amenities";
import { formatCommunityMoney } from "@/lib/money";

const STATUS_META: Record<string, { label: string; tone: "amber" | "green" | "red" | "slate" }> = {
  pending: { label: "Pending", tone: "amber" },
  confirmed: { label: "Approved", tone: "green" },
  rejected: { label: "Declined", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

function formatBookingDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function BookingInfoModal({
  booking,
  onClose,
  onApprove,
  onReject,
  actionBusy = false,
}: {
  booking: Booking | null;
  onClose: () => void;
  onApprove?: (booking: Booking) => void;
  onReject?: (booking: Booking) => void;
  actionBusy?: boolean;
}) {
  if (!booking) return null;

  const status = STATUS_META[booking.status] ?? STATUS_META.pending;
  const showReviewActions = booking.status === "pending" && (onApprove || onReject);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="booking-info-title" className="text-base font-bold text-slate-900 sm:text-lg">
                Booking details
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">Request #{booking.id}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3.5 sm:space-y-4 sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
          </div>

          <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amenity</p>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
                <AmenityIcon iconKey={booking.amenity_icon_key} name={booking.amenity_name} size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold text-slate-900">{booking.amenity_name}</p>
                {booking.amenity_description ? (
                  <p className="mt-1 break-words text-sm leading-relaxed text-slate-600">
                    {booking.amenity_description}
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1.5 text-xs text-slate-500">
                  {booking.amenity_capacity ? (
                    <li className="flex items-start gap-2">
                      <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Capacity {booking.amenity_capacity}</span>
                    </li>
                  ) : null}
                  {booking.amenity_floor ? (
                    <li className="flex items-start gap-2">
                      <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">{booking.amenity_floor}</span>
                    </li>
                  ) : null}
                  {booking.amenity_hours ? (
                    <li className="flex items-start gap-2">
                      <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">{booking.amenity_hours}</span>
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Member</p>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                {(booking.user_name ?? "R").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                  <User className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="break-words">{booking.user_name || "Resident"}</span>
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  <MemberUnitsLabel
                    userUnits={booking.user_units}
                    userUnit={booking.user_unit}
                    variant="inline"
                    empty="No unit on file"
                  />
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 px-3.5 py-3 sm:px-4">
            <div className="flex items-start gap-3 text-sm text-slate-700">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 break-words">{formatBookingDate(booking.date)}</span>
            </div>
            <div className="mt-3 flex items-start gap-3 text-sm text-slate-700">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 break-words">{booking.time_slot || "Open access request"}</span>
            </div>
            <div className="mt-3 flex items-start gap-3 text-sm text-slate-700">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>
                {booking.guests} guest{booking.guests === 1 ? "" : "s"}
              </span>
            </div>
            {booking.requested_at || booking.created_at ? (
              <p className="mt-3 text-xs text-slate-500">
                Requested{" "}
                {new Date(
                  (booking.requested_at ?? booking.created_at ?? "").includes("T")
                    ? (booking.requested_at ?? booking.created_at)!
                    : (booking.requested_at ?? booking.created_at)!.replace(" ", "T"),
                ).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            ) : null}
            {booking.notes ? (
              <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {booking.notes}
              </p>
            ) : null}
            {booking.status === "rejected" && booking.rejection_reason ? (
              <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">Rejection reason</p>
                <p className="mt-1 break-words text-sm leading-relaxed text-rose-800">{booking.rejection_reason}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-100 px-3.5 py-3 sm:px-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Booking fee</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {formatCommunityMoney(booking.display_fee ?? booking.booking_fee)}
            </p>
            {booking.payment_proof ? (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <p>Payment date: {booking.payment_proof.payment_date || "—"}</p>
                <p className="break-words">Reference: {booking.payment_proof.payment_reference || "—"}</p>
                {booking.payment_proof.payment_note ? <p className="break-words">Note: {booking.payment_proof.payment_note}</p> : null}
                {booking.payment_proof.file_url ? (
                  booking.payment_proof.mime_type?.startsWith("image/") ? (
                    <a href={booking.payment_proof.file_url} target="_blank" rel="noreferrer">
                      <img
                        src={booking.payment_proof.file_url}
                        alt="Payment proof"
                        className="mt-2 max-h-48 w-full rounded-lg bg-slate-50 object-contain sm:max-h-56"
                      />
                    </a>
                  ) : (
                    <a
                      href={booking.payment_proof.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#1B4F8A]"
                    >
                      View payment proof
                    </a>
                  )
                ) : null}
              </div>
            ) : Number(booking.booking_fee ?? 0) > 0 ? (
              <p className="mt-2 text-sm text-slate-500">No payment proof uploaded.</p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No payment required.</p>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button type="button" onClick={onClose} className="nl-btn-secondary w-full sm:w-auto" disabled={actionBusy}>
              Close
            </button>
            {showReviewActions ? (
              <>
                {onReject ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => onReject(booking)}
                    className="w-full rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 sm:w-auto"
                  >
                    {actionBusy ? "Working…" : "Reject"}
                  </button>
                ) : null}
                {onApprove ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => onApprove(booking)}
                    className="nl-btn-primary w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
                  >
                    {actionBusy ? "Working…" : "Approve"}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}