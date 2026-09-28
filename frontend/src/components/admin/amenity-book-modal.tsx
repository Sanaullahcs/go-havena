"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  createBooking,
  fetchAmenitySlots,
  type Amenity,
  type AmenitySlot,
} from "@/lib/api/amenities";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import {
  BookingPaymentSummary,
  bookingFeeAmount,
  isFullSlotCapacity,
  maxBookableSeats,
  reservationFeeTotal,
} from "@/components/property/booking-payment-fields";

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function AmenityBookModal({
  amenity,
  onClose,
  onBooked,
}: {
  amenity: Amenity | null;
  onClose: () => void;
  onBooked?: () => void;
}) {
  const [date, setDate] = useState(tomorrowIso());
  const [slot, setSlot] = useState("");
  const [guests, setGuests] = useState("1");
  const [slots, setSlots] = useState<AmenitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState<string | null>(null);
  const [alreadyBooked, setAlreadyBooked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!amenity) return;
    setDate(tomorrowIso());
    setSlot("");
    setGuests("1");
  }, [amenity]);

  useEffect(() => {
    if (!amenity || amenity.status !== "bookable" || !date) {
      setSlots([]);
      setSlotsMessage(null);
      setAlreadyBooked(false);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlotsMessage(null);
    setAlreadyBooked(false);
    void fetchAmenitySlots(amenity.id, date)
      .then((res) => {
        if (cancelled) return;
        setAlreadyBooked(res.userAlreadyBooked);
        setSlots(res.slots);
        setSlotsMessage(
          res.userAlreadyBooked
            ? res.message || "You already have a reservation for this amenity on this date."
            : res.closed
              ? res.message || "Closed on this date."
              : null,
        );
        setSlot((prev) =>
          res.slots.some((s) => s.value === prev && s.available !== false) ? prev : "",
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots([]);
          setSlotsMessage(apiError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [amenity, date]);

  if (!amenity) return null;

  if (amenity.is_mine) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-slate-900">Your amenity</h3>
          <p className="mt-2 text-sm text-slate-500">
            You manage booking requests for {amenity.name}. Creators cannot book their own amenity.
          </p>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onClose} className="nl-btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedSlot = slots.find((item) => item.value === slot);
  const fullSlot = isFullSlotCapacity(amenity.capacity_booking_type) && amenity.status === "bookable";
  const remaining =
    amenity.status === "bookable"
      ? selectedSlot?.remaining != null
        ? selectedSlot.remaining
        : Math.max(0, Number(amenity.capacity) || 0)
      : Math.max(0, Number(amenity.capacity) || 0);
  const maxGuests = maxBookableSeats({
    capacity: amenity.capacity,
    remaining,
    remainingForward: selectedSlot?.remaining_forward,
    fullSlot,
  });
  const unitFee = amenity.shared_billing_enabled ? 0 : bookingFeeAmount(amenity.booking_fee);
  const guestCount = fullSlot ? 1 : Math.max(1, parseInt(guests, 10) || 1);
  const fee = reservationFeeTotal(unitFee, guestCount, fullSlot);

  const handleSubmit = async () => {
    if (!date) {
      toastError("Choose a date.");
      return;
    }
    if (alreadyBooked) {
      toastError("You already have a reservation for this amenity on this date.");
      return;
    }
    if (amenity.status === "bookable" && !slot) {
      toastError("Choose an available time slot.");
      return;
    }
    const guestCount = fullSlot ? 1 : parseInt(guests, 10) || 1;
    if (!fullSlot && guestCount > maxGuests) {
      toastError(`Only ${maxGuests} ${maxGuests === 1 ? "spot" : "spots"} left from this ${amenity.status === "bookable" ? "time slot" : "date"}.`);
      return;
    }

    setSubmitting(true);
    try {
      await createBooking({
        amenity_id: amenity.id,
        date,
        ...(amenity.status === "bookable" ? { time_slot: slot } : {}),
        guests: guestCount,
      });
      toastSuccess(`Booking request sent for ${amenity.name}.`);
      onBooked?.();
      onClose();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {amenity.status === "open" ? "Request" : "Book"} {amenity.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              The amenity creator will review your request
              {fee > 0 ? ". Payment proof is requested after they approve." : "."}
            </p>
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="nl-label">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="nl-input mt-1.5"
            />
          </div>

          {amenity.status === "bookable" ? (
            <div>
              <label className="nl-label">Available slots</label>
              {slotsLoading ? (
                <p className="mt-2 text-sm text-slate-400">Loading slots…</p>
              ) : slotsMessage ? (
                <p className="mt-2 text-sm text-amber-700">{slotsMessage}</p>
              ) : slots.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No open slots for this date.</p>
              ) : (
                <div className="mt-2 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                  {slots.map((item) => {
                    const taken = item.available === false;
                    const active = slot === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        disabled={taken}
                        onClick={() => {
                          setSlot(item.value);
                          if (fullSlot) {
                            setGuests("1");
                            return;
                          }
                          const max = maxBookableSeats({
                            capacity: amenity.capacity,
                            remaining: item.remaining,
                            remainingForward: item.remaining_forward,
                          });
                          setGuests((prev) =>
                            String(Math.min(Math.max(1, parseInt(prev, 10) || 1), max)),
                          );
                        }}
                        className={[
                          "rounded-xl border px-3 py-2 text-left text-[12.5px] font-semibold transition",
                          taken
                            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                            : active
                              ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
                              : "border-slate-200 text-slate-700 hover:border-slate-300",
                        ].join(" ")}
                      >
                        {item.value}
                        {taken
                          ? " · Full"
                          : item.remaining != null
                            ? fullSlot
                              ? " · Available"
                              : ` · ${item.remaining} left`
                            : ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {fullSlot ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">This books the entire slot</p>
              <p className="mt-1 text-xs text-slate-500">
                Capacity is {Number(amenity.capacity) || 0}. Other residents will not be able to book this time.
              </p>
            </div>
          ) : (
            <div>
              <label className="nl-label">How many guests are you booking?</label>
              {amenity.status === "bookable" && slot && maxGuests <= 24 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from({ length: maxGuests }, (_, index) => index + 1).map((count) => {
                    const active = guestCount === count;
                    return (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setGuests(String(count))}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                          active
                            ? "border-[#1B4F8A] bg-[#E8F0F7] text-[#1B4F8A]"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        ].join(" ")}
                      >
                        {count} {count === 1 ? "guest" : "guests"}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="number"
                  min={1}
                  max={maxGuests}
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  className="nl-input mt-1.5"
                />
              )}
              <p className="mt-1 text-xs text-slate-400">
                {amenity.status === "bookable" && slot
                  ? selectedSlot?.remaining != null &&
                    selectedSlot.remaining_forward != null &&
                    selectedSlot.remaining_forward > selectedSlot.remaining
                    ? `${selectedSlot.remaining} left in this slot. Extra seats use the next available slots.`
                    : `Up to ${maxGuests} ${maxGuests === 1 ? "guest" : "guests"} available from this slot`
                  : `Max ${maxGuests} guests`}
              </p>
            </div>
          )}

          <BookingPaymentSummary
            amenityName={amenity.name}
            date={date}
            slot={amenity.status === "bookable" ? slot : "Open access"}
            fee={fee}
            guests={guestCount}
            unitFee={unitFee}
            fullSlot={fullSlot}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || alreadyBooked}
            onClick={() => void handleSubmit()}
            className="nl-btn-primary disabled:opacity-60"
          >
            {submitting ? "Submitting…" : amenity.status === "open" ? "Submit request" : "Book now"}
          </button>
        </div>
      </div>
    </div>
  );
}
