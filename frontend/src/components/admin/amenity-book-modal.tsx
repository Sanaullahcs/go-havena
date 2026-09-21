"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  createBooking,
  fetchAmenitySlots,
  type Amenity,
  type AmenitySlot,
} from "@/lib/api/amenities";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import { todayIsoDate, validatePaymentProofForm } from "@/lib/admin/amenity-bill-validation";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import {
  BookingPaymentFields,
  BookingPaymentSummary,
  bookingFeeAmount,
  type BookingPaymentForm,
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
  const [slots, setSlots] = useState<Array<AmenitySlot & { available?: boolean }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState<string | null>(null);
  const [alreadyBooked, setAlreadyBooked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payment, setPayment] = useState<BookingPaymentForm>({
    file: null,
    payment_date: todayIsoDate(),
    payment_reference: "",
    payment_note: "",
    method: "proof",
  });
  const { showError, touch, validateOnSubmit, resetTouched } = useTouchedFieldErrors();
  const paymentErrors = useMemo(() => validatePaymentProofForm(payment), [payment]);

  useEffect(() => {
    if (!amenity) return;
    setDate(tomorrowIso());
    setSlot("");
    setGuests("1");
    setPayment({
      file: null,
      payment_date: todayIsoDate(),
      payment_reference: "",
      payment_note: "",
      method: "proof",
    });
    resetTouched();
  }, [amenity, resetTouched]);

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

  const maxGuests = Math.max(1, Number(amenity.capacity) || 50);
  const fee = bookingFeeAmount(amenity.booking_fee);

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
    const guestCount = parseInt(guests, 10) || 1;
    if (guestCount > maxGuests) {
      toastError(`This amenity allows up to ${maxGuests} guests.`);
      return;
    }
    if (fee > 0 && !validateOnSubmit(paymentErrors)) {
      toastError(paymentErrors.file || paymentErrors.payment_date || "Add payment proof to continue.");
      return;
    }

    setSubmitting(true);
    try {
      await createBooking({
        amenity_id: amenity.id,
        date,
        ...(amenity.status === "bookable" ? { time_slot: slot } : {}),
        guests: guestCount,
        ...(fee > 0
          ? {
              payment_proof: payment.file,
              payment_date: payment.payment_date,
              payment_reference: payment.payment_reference.trim() || undefined,
              payment_note: payment.payment_note.trim() || undefined,
            }
          : {}),
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
              The amenity creator will review your request.
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
                        onClick={() => setSlot(item.value)}
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
                        {taken ? " · Taken" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          <div>
            <label className="nl-label">Guests</label>
            <input
              type="number"
              min={1}
              max={maxGuests}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              className="nl-input mt-1.5"
            />
            <p className="mt-1 text-xs text-slate-400">Max {maxGuests} guests</p>
          </div>

          <BookingPaymentSummary
            amenityName={amenity.name}
            date={date}
            slot={amenity.status === "bookable" ? slot : "Open access"}
            fee={fee}
          />
          <BookingPaymentFields
            fee={fee}
            form={payment}
            errors={paymentErrors}
            showError={showError}
            onChange={(key, value) => setPayment((prev) => ({ ...prev, [key]: value }))}
            onBlur={(field) => touch(field)}
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
