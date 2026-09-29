"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  createBooking,
  fetchAmenitySlots,
  type Amenity,
  type AmenitySlot,
} from "@/lib/api/amenities";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import { BookingPaymentSummary, bookingFeeAmount, isFullSlotCapacity, maxBookableSeats, reservationFeeTotal } from "@/components/property/booking-payment-fields";
import { formatUsdAmount } from "@/lib/admin/amenity-bill-validation";
import { useResidentPlaidConnect } from "@/components/plaid/use-resident-plaid-connect";
import { fetchAchCapability, type AchCapability, type PlaidExchangePayload } from "@/lib/api/resident-plaid";
import { COMMUNITY_BANK_MISSING_MESSAGE, paidBookingPlaidStep } from "@/lib/plaid/paid-booking";
import { AmenitySlotPicker } from "@/components/property/amenity-slot-picker";

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
  const [resolvedSlotKey, setResolvedSlotKey] = useState("");
  const [slotsMessage, setSlotsMessage] = useState<string | null>(null);
  const [alreadyBooked, setAlreadyBooked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [capability, setCapability] = useState<AchCapability | null>(null);
  const amenityRef = useRef(amenity);
  amenityRef.current = amenity;

  useEffect(() => {
    if (!amenity) return;
    setDate(tomorrowIso());
    setSlot("");
    setGuests("1");
  }, [amenity]);

  useEffect(() => {
    if (!amenity) return;
    let cancelled = false;
    void fetchAchCapability()
      .then((next) => {
        if (!cancelled) setCapability(next);
      })
      .catch(() => {
        if (!cancelled) setCapability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [amenity]);

  const submitBankBooking = async (currentAmenity: Amenity) => {
    if (!date) {
      toastError("Choose a date.");
      return;
    }
    if (currentAmenity.status === "bookable" && !slot) {
      toastError("Choose an available time slot.");
      return;
    }
    const guestCount = parseInt(guests, 10) || 1;
    setSubmitting(true);
    try {
      await createBooking({
        amenity_id: currentAmenity.id,
        date,
        ...(currentAmenity.status === "bookable" ? { time_slot: slot } : {}),
        guests: guestCount,
        payment_method: "bank_ach",
      });
      toastSuccess(`Bank payment sent for ${currentAmenity.name}. The amenity owner will review the request.`);
      onBooked?.();
      onClose();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const startPlaidRef = useRef<() => Promise<void>>(async () => {});
  const { start: startPlaid, busy: plaidBusy, launcher: plaidLauncher } = useResidentPlaidConnect(
    async (resident: PlaidExchangePayload) => {
      const current = capability;
      const next: AchCapability | null = current
        ? {
            ...current,
            resident,
            can_pay_with_bank: Boolean(current.community.bank_connected && resident.connected),
            requires_resident_link: !resident.connected,
          }
        : null;
      setCapability(next);
      const currentAmenity = amenityRef.current;
      if (!currentAmenity || !next) return;
      const fee = currentAmenity.shared_billing_enabled ? 0 : bookingFeeAmount(currentAmenity.booking_fee);
      if (paidBookingPlaidStep(fee, next) === "community_bank") {
        toastError(COMMUNITY_BANK_MISSING_MESSAGE);
        return;
      }
      if (paidBookingPlaidStep(fee, next) === "charge") {
        await submitBankBooking(currentAmenity);
      }
    },
  );
  startPlaidRef.current = startPlaid;

  const slotKey = amenity?.status === "bookable" && date ? `${amenity.id}:${date}` : "";
  const slotsLoading = slotKey !== "" && resolvedSlotKey !== slotKey;

  useEffect(() => {
    if (!amenity || amenity.status !== "bookable" || !date) {
      setSlots([]);
      setSlotsMessage(null);
      setAlreadyBooked(false);
      setResolvedSlotKey("");
      return;
    }
    const key = `${amenity.id}:${date}`;
    let cancelled = false;
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
        setResolvedSlotKey(key);
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots([]);
          setSlotsMessage(apiError(err));
          setResolvedSlotKey(key);
        }
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

    const step = paidBookingPlaidStep(fee, capability);
    if (step === "link") {
      await startPlaidRef.current();
      return;
    }
    if (step === "community_bank") {
      toastError(COMMUNITY_BANK_MISSING_MESSAGE);
      return;
    }
    if (step === "charge") {
      await submitBankBooking(amenity);
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

  const bookStep = paidBookingPlaidStep(fee, capability);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      {plaidLauncher}
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {amenity.status === "open" ? "Request" : "Book"} {amenity.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              The amenity creator will review your request
              {fee > 0 ? ". Paid amenities open Plaid before the reservation is saved." : "."}
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
              <AmenitySlotPicker
                loading={slotsLoading}
                slots={slots}
                message={slotsMessage}
                selected={slot}
                fullSlot={fullSlot}
                onSelect={(value) => {
                  setSlot(value);
                  const item = slots.find((slotItem) => slotItem.value === value);
                  if (fullSlot) {
                    setGuests("1");
                    return;
                  }
                  const max = maxBookableSeats({
                    capacity: amenity.capacity,
                    remaining: item?.remaining,
                    remainingForward: item?.remaining_forward,
                  });
                  setGuests((prev) =>
                    String(Math.min(Math.max(1, parseInt(prev, 10) || 1), max)),
                  );
                }}
              />
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

          {bookStep === "community_bank" ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              Your bank is connected. This community has not connected a receiving account, so this paid amenity cannot be booked yet.
            </p>
          ) : null}
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

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-5 sm:py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary w-full sm:w-auto">
            Cancel
          </button>
          <button
            type="button"
                disabled={submitting || plaidBusy || alreadyBooked || bookStep === "community_bank" || (amenity.status === "bookable" && slotsLoading)}
            onClick={() => void handleSubmit()}
            className="nl-btn-primary w-full disabled:opacity-60 sm:w-auto"
          >
            {plaidBusy
              ? "Opening Plaid…"
              : submitting
                ? "Submitting…"
                : bookStep === "link"
                  ? "Continue to Plaid"
                  : bookStep === "charge"
                    ? `Pay ${formatUsdAmount(fee)} with bank`
                    : bookStep === "community_bank"
                      ? "Receiving account needed"
                      : amenity.status === "bookable" && slotsLoading
                        ? "Loading slots…"
                      : amenity.status === "open"
                      ? "Submit request"
                      : "Book now"}
          </button>
        </div>
      </div>
    </div>
  );
}
