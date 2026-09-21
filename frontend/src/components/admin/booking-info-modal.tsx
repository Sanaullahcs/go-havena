"use client";

import { Building2, Calendar, Clock3, User, Users, X } from "lucide-react";
import { AdminBadge } from "@/components/admin/ui";
import { AmenityIcon } from "@/components/admin/amenity-icon";
import type { Booking } from "@/lib/api/amenities";

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
}: {
  booking: Booking | null;
  onClose: () => void;
}) {
  if (!booking) return null;

  const status = STATUS_META[booking.status] ?? STATUS_META.pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Booking details</h3>
            <p className="mt-0.5 text-xs text-slate-500">Request #{booking.id}</p>
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
          <div className="flex items-center justify-between gap-3">
            <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
          </div>

          <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amenity</p>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
                <AmenityIcon
                  iconKey={booking.amenity_icon_key}
                  name={booking.amenity_name}
                  size={18}
                />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{booking.amenity_name}</p>
                {booking.amenity_description ? (
                  <p className="mt-1 text-sm text-slate-600">{booking.amenity_description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {booking.amenity_capacity ? (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Capacity {booking.amenity_capacity}
                    </span>
                  ) : null}
                  {booking.amenity_floor ? (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {booking.amenity_floor}
                    </span>
                  ) : null}
                  {booking.amenity_hours ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {booking.amenity_hours}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Member</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                {(booking.user_name ?? "R").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                  <User className="h-4 w-4 text-slate-400" />
                  {booking.user_name || "Resident"}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {booking.user_unit ? `Unit ${booking.user_unit}` : "No unit on file"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 px-4 py-3">
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
              <span>{formatBookingDate(booking.date)}</span>
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm text-slate-700">
              <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />
              <span>{booking.time_slot || "Open access request"}</span>
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm text-slate-700">
              <Users className="h-4 w-4 shrink-0 text-slate-400" />
              <span>{booking.guests} guest{booking.guests === 1 ? "" : "s"}</span>
            </div>
            {booking.notes ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{booking.notes}</p>
            ) : null}
          </section>
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
