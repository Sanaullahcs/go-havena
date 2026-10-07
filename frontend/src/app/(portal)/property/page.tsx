"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { confirmAction, toastSuccess, toastError } from "@/lib/alert";
import {
  fetchAmenities,
  fetchMyBookings,
  fetchBookingInbox,
  fetchAmenitySlots,
  createBooking,
  cancelBooking,
  approveBooking,
  rejectBooking,
  createResidentAmenity,
  type Amenity,
  type AmenitySlot,
  type Booking,
} from "@/lib/api/amenities";
import { apiError } from "@/lib/api/client";
import { PageLoader } from "@/components/shared/page-states";
import { AmenityFormModal } from "@/components/admin/amenity-form-modal";
import { AmenityResidentBills } from "@/components/property/amenity-resident-bills";
import { UnitServiceWorkspace } from "@/components/property/unit-service-bills";
import {
  BookingPaymentFields,
  BookingPaymentSummary,
  bookingFeeAmount,
  isFullSlotCapacity,
  maxBookableSeats,
  reservationFeeTotal,
  type BookingPaymentForm,
} from "@/components/property/booking-payment-fields";
import { formatUsdAmount, todayIsoDate, validatePaymentProofForm } from "@/lib/admin/amenity-bill-validation";
import { bankAccountLabel, fetchAchCapability, type AchCapability, type PlaidExchangePayload } from "@/lib/api/resident-plaid";
import { useResidentPlaidConnect } from "@/components/plaid/use-resident-plaid-connect";
import { COMMUNITY_BANK_MISSING_MESSAGE, paidBookingPlaidStep } from "@/lib/plaid/paid-booking";
import { AmenitySlotPicker } from "@/components/property/amenity-slot-picker";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  open:     { bg: "#ecfdf5", text: "#0D9488", label: "Open availability", dot: "#10b981" },
  closed:   { bg: "#fef2f2", text: "#dc2626", label: "Closed", dot: "#ef4444" },
  bookable: { bg: "#E8F0F7", text: "#1B4F8A", label: "Timed slots", dot: "#1B4F8A" },
};

const RULES = [
  { title: "Quiet Hours", desc: "Noise must be kept to a minimum between 10pm and 7am daily. Violations may result in formal notices.", icon: <IcoMoon /> },
  { title: "No Pets in Shared Areas", desc: "Pets are not permitted in the pool, gym, play area, or community hall at any time.", icon: <IcoPet /> },
  { title: "Guest Registration", desc: "All guests must be signed in at the security desk before entry to the building or amenities.", icon: <IcoUser /> },
  { title: "Keep Common Areas Clean", desc: "Dispose of waste responsibly. Littering or leaving items in communal spaces is subject to penalties.", icon: <IcoClean /> },
  { title: "Assigned Parking Only", desc: "Use your designated parking bay only. Visitor parking bays are clearly marked near the entrance.", icon: <IcoCar /> },
  { title: "Report Maintenance Issues", desc: "Submit any maintenance requests within 24 hours via the app or by visiting the management office.", icon: <IcoWrench /> },
];

const AMENITY_COLOR = ["#1B4F8A", "#dc2626", "#d97706", "#0D9488", "#7c3aed", "#0891b2"];

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function PropertyPage() {
  const [tab, setTab] = useState<"amenities" | "services" | "rules" | "bookings" | "inbox">("amenities");
  const [bookModal, setBookModal] = useState<Amenity | null>(null);
  const [bookForm, setBookForm] = useState({ date: tomorrowIso(), slot: "", guests: "1" });
  const [payment, setPayment] = useState<BookingPaymentForm>({
    file: null,
    payment_date: todayIsoDate(),
    payment_reference: "",
    payment_note: "",
    method: "proof",
  });
  const [achCapability, setAchCapability] = useState<AchCapability | null>(null);
  const { showError, touch, validateOnSubmit, resetTouched } = useTouchedFieldErrors();
  const paymentErrors = useMemo(() => validatePaymentProofForm(payment), [payment]);
  const [slots, setSlots] = useState<AmenitySlot[]>([]);
  const [resolvedSlotKey, setResolvedSlotKey] = useState("");
  const [slotsMessage, setSlotsMessage] = useState<string | null>(null);
  const [alreadyBookedDate, setAlreadyBookedDate] = useState(false);

  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [amenityQuery, setAmenityQuery] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inbox, setInbox] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ams, bks, inboxRows, capability] = await Promise.all([
        fetchAmenities(),
        fetchMyBookings(),
        fetchBookingInbox().catch(() => [] as Booking[]),
        fetchAchCapability().catch(() => null),
      ]);
      setAmenities(ams);
      setBookings(bks);
      setInbox(inboxRows);
      setAchCapability(capability);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const slotKey =
    bookModal?.status === "bookable" && bookForm.date ? `${bookModal.id}:${bookForm.date}` : "";
  const slotsLoading = slotKey !== "" && resolvedSlotKey !== slotKey;

  useEffect(() => {
    if (!bookModal || bookModal.status !== "bookable" || !bookForm.date) {
      setSlots([]);
      setSlotsMessage(null);
      setAlreadyBookedDate(false);
      setResolvedSlotKey("");
      return;
    }
    const key = `${bookModal.id}:${bookForm.date}`;
    let cancelled = false;
    setSlotsMessage(null);
    setAlreadyBookedDate(false);
    void fetchAmenitySlots(bookModal.id, bookForm.date)
      .then((res) => {
        if (cancelled) return;
        setAlreadyBookedDate(res.userAlreadyBooked);
        setSlots(res.slots);
        setSlotsMessage(
          res.userAlreadyBooked
            ? res.message || "You already have a reservation for this amenity on this date."
            : res.closed
              ? res.message || "Closed on this date."
              : null,
        );
        setBookForm((f) => ({
          ...f,
          slot: res.slots.some((s) => s.value === f.slot && s.available !== false) ? f.slot : "",
        }));
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
  }, [bookModal, bookForm.date]);

  const openBookModal = (amenity: Amenity) => {
    if (amenity.is_mine) {
      toastError("You cannot book an amenity you created. Manage requests in Approve Requests.");
      setTab("inbox");
      return;
    }
    setBookForm({ date: tomorrowIso(), slot: "", guests: "1" });
    setPayment({
      file: null,
      payment_date: todayIsoDate(),
      payment_reference: "",
      payment_note: "",
      method: achCapability?.can_pay_with_bank ? "bank_ach" : "proof",
    });
    resetTouched();
    setBookModal(amenity);
  };

  const bookAmenityRef = useRef<Amenity | null>(null);

  const placeBooking = useCallback(async (
    amenity: Amenity,
    capability: AchCapability | null,
    options?: { skipConfirm?: boolean },
  ) => {
    if (amenity.is_mine) {
      toastError("You cannot book an amenity you created.");
      return;
    }
    if (!bookForm.date) {
      toastError("Choose a date.");
      return;
    }
    if (alreadyBookedDate) {
      toastError("You already have a reservation for this amenity on this date.");
      return;
    }
    if (amenity.status === "bookable" && !bookForm.slot) {
      toastError("Choose an available time slot.");
      return;
    }
    const selectedSlot = slots.find((s) => s.value === bookForm.slot);
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
    const guestCount = fullSlot ? 1 : parseInt(bookForm.guests, 10) || 1;
    if (!fullSlot && guestCount > maxGuests) {
      toastError(`Only ${maxGuests} ${maxGuests === 1 ? "spot" : "spots"} left from this ${amenity.status === "bookable" ? "time slot" : "date"}.`);
      return;
    }

    const unitFee = amenity.shared_billing_enabled ? 0 : bookingFeeAmount(amenity.booking_fee);
    const openAccess = amenity.status === "open";
    const fee = reservationFeeTotal(unitFee, guestCount, fullSlot, openAccess);
    const step = paidBookingPlaidStep(fee, capability);
    if (step === "link") {
      bookAmenityRef.current = amenity;
      await startPlaidRef.current();
      return;
    }
    if (step === "community_bank") {
      toastError(COMMUNITY_BANK_MISSING_MESSAGE);
      return;
    }
    if (step === "proof" && !validateOnSubmit(paymentErrors)) {
      toastError(paymentErrors.file || paymentErrors.payment_date || "Add payment proof to continue.");
      return;
    }

    const slotLabel = amenity.status === "bookable" ? bookForm.slot : "Open access request";
    if (!options?.skipConfirm) {
      const feeLine =
        step === "charge"
          ? ` Pay ${formatUsdAmount(fee)} from your linked bank through Plaid now.`
          : fee > 0
            ? fullSlot
              ? ` Reservation fee ${formatUsdAmount(fee)}.`
              : ` Reservation fee ${formatUsdAmount(fee)} (${formatUsdAmount(unitFee)} × ${guestCount}).`
            : amenity.shared_billing_enabled
              ? ` Shared fee ${formatUsdAmount(amenity.display_fee ?? amenity.shared_billing_amount)} must already be paid.`
              : "";
      const r = await confirmAction({
        title: step === "charge" ? `Pay for ${amenity.name}?` : `Request ${amenity.name}?`,
        text: `Date: ${bookForm.date}${amenity.status === "bookable" ? ` · ${slotLabel}` : ""}.${feeLine} The amenity creator will review your request.`,
        confirmText: step === "charge" ? `Pay ${formatUsdAmount(fee)} with bank` : "Submit request",
        color: "green",
      });
      if (!r.isConfirmed) return;
    }

    setSubmitting(true);
    try {
      await createBooking({
        amenity_id: amenity.id,
        date: bookForm.date,
        ...(amenity.status === "bookable" ? { time_slot: bookForm.slot } : {}),
        guests: guestCount,
        ...(step === "charge"
          ? { payment_method: "bank_ach" as const }
          : step === "proof"
            ? {
                payment_method: "proof" as const,
                payment_proof: payment.file,
                payment_date: payment.payment_date,
                payment_reference: payment.payment_reference.trim() || undefined,
                payment_note: payment.payment_note.trim() || undefined,
              }
            : {}),
      });
      setBookModal(null);
      toastSuccess(
        step === "charge"
          ? `Bank payment sent for ${amenity.name}. The amenity owner will review the request.`
          : `Request submitted for ${amenity.name}.`,
      );
      loadData();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  }, [alreadyBookedDate, bookForm.date, bookForm.guests, bookForm.slot, loadData, payment, paymentErrors, validateOnSubmit]);

  const startPlaidRef = useRef<() => Promise<void>>(async () => {});
  const { start: startPlaid, busy: plaidBusy, launcher: plaidLauncher } = useResidentPlaidConnect(
    async (resident: PlaidExchangePayload) => {
      const current = achCapability;
      const next: AchCapability | null = current
        ? {
            ...current,
            resident,
            can_pay_with_bank: Boolean(current.community.bank_connected && resident.connected),
            requires_resident_link: !resident.connected,
          }
        : null;
      setAchCapability(next);
      const amenity = bookAmenityRef.current;
      if (amenity) await placeBooking(amenity, next, { skipConfirm: true });
    },
  );
  startPlaidRef.current = startPlaid;

  const handleBook = (amenity: Amenity) => placeBooking(amenity, achCapability);

  const handleCancelBooking = async (booking: Booking) => {
    const r = await confirmAction({ title: "Cancel booking?", text: `Your ${booking.amenity_name} booking will be cancelled. This cannot be undone.`, confirmText: "Cancel Booking", icon: "warning", color: "red" });
    if (r.isConfirmed) {
      try {
        await cancelBooking(booking.id);
        toastSuccess("Booking cancelled successfully.");
        loadData();
      } catch (err) {
        toastError(apiError(err));
      }
    }
  };

  if (loading) return <PageLoader variant="cards" />;

  const bookFee = bookModal && !bookModal.shared_billing_enabled ? bookingFeeAmount(bookModal.booking_fee) : 0;
  const bookStep = paidBookingPlaidStep(bookFee, achCapability);

  return (
    <div className="space-y-5">
      {plaidLauncher}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="nl-eyebrow" style={{ color: "#0D9488" }}>Your Home</p>
          <h2 className="mt-0.5 text-xl font-bold text-slate-900">Property &amp; Amenities</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Book facilities, request open access, and approve bookings for amenities you created.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="nl-btn-primary inline-flex items-center gap-2"
        >
          <IcoPlus /> Add Amenity
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-fit">
        {([
          { id: "amenities" as const, label: "Amenities" },
          { id: "services" as const, label: "Unit services" },
          { id: "rules" as const, label: "Rules" },
          { id: "bookings" as const, label: `My Reservations (${bookings.length})` },
          { id: "inbox" as const, label: `Approve Requests (${inbox.filter((b) => b.status === "pending").length})` },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "rounded-lg px-4 py-1.5 text-[13px] font-semibold transition",
              tab === t.id ? "text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
            ].join(" ")}
            style={tab === t.id ? { background: "#14B8A6" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Amenities ── */}
      {tab === "amenities" && (
        <div className="space-y-6">
          {amenities.length > 0 ? (
            <div className="relative max-w-md">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&_svg]:h-4 [&_svg]:w-4">
                <IcoSearch />
              </span>
              <input
                type="search"
                value={amenityQuery}
                onChange={(e) => setAmenityQuery(e.target.value)}
                placeholder="Search amenities…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 text-[13px] shadow-sm outline-none placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                style={{ paddingLeft: "2.25rem" }}
              />
            </div>
          ) : null}
          {(() => {
            const q = amenityQuery.trim().toLowerCase();
            const matches = (a: Amenity) =>
              !q ||
              [a.name, a.description, a.floor, a.hours]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(q);
            const mine = amenities.filter((a) => a.is_mine && matches(a));
            const others = amenities.filter((a) => !a.is_mine && matches(a));
            const renderCard = (a: Amenity, idx: number, owned: boolean) => {
              const statusKey = a.status?.toLowerCase() ?? "open";
              const st = STATUS_STYLE[statusKey] ?? STATUS_STYLE.open;
              const color = AMENITY_COLOR[idx % AMENITY_COLOR.length];
              const billingRestricted = Boolean(a.has_overdue_shared_amenity_bill);
              const canRequest =
                !owned &&
                !billingRestricted &&
                a.review_status !== "pending" &&
                a.review_status !== "rejected" &&
                (statusKey === "bookable" || statusKey === "open");
              const imgUrl =
                a.image_url ??
                "https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=400&q=80";
              return (
                <div
                  key={a.id}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative overflow-hidden" style={{ paddingBottom: "50%" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imgUrl}
                      alt={a.name}
                      className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute bottom-2 left-3 flex flex-wrap items-center gap-1.5">
                      {owned ? (
                        <span className="rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                          Yours
                        </span>
                      ) : null}
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold backdrop-blur-sm"
                        style={{ background: st.bg, color: st.text }}
                      >
                        <span
                          className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                          style={{ background: st.dot }}
                        />
                        {a.review_status === "pending"
                          ? "Pending review"
                          : a.review_status === "rejected"
                            ? "Rejected"
                            : st.label}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-slate-900">{a.name}</h3>
                    <div className="mt-1 flex items-center gap-3 text-[12px] text-slate-400">
                      <span className="flex items-center gap-1 [&_svg]:h-3 [&_svg]:w-3">
                        <IcoClock />
                        {a.hours}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11.5px] text-slate-400">
                      <span>{a.capacity} persons</span>
                      <span className="text-slate-200">·</span>
                      <span>{a.floor}</span>
                      <span className="text-slate-200">·</span>
                      <span>
                        {a.shared_billing_enabled
                          ? `${formatUsdAmount(a.display_fee ?? a.shared_billing_amount)} / ${a.shared_billing_frequency === "yearly" ? "year" : "month"}`
                          : Number(a.display_fee ?? a.booking_fee ?? 0) > 0
                            ? formatUsdAmount(a.display_fee ?? a.booking_fee)
                            : "Free"}
                      </span>
                    </div>
                    {owned ? (
                      <div className="mt-3 space-y-2">
                        <p className="rounded-xl bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-600">
                          You manage requests for this amenity. Booking your own is disabled.
                        </p>
                        <button
                          type="button"
                          onClick={() => setTab("inbox")}
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 text-[12.5px] font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          Manage booking requests
                        </button>
                      </div>
                    ) : billingRestricted && !owned ? (
                      <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">
                        Booking is paused until this amenity&apos;s shared bill is paid and approved.
                      </p>
                    ) : canRequest ? (
                      <button
                        onClick={() => openBookModal(a)}
                        className="mt-3 w-full rounded-xl py-2 text-[12.5px] font-bold text-white transition hover:opacity-90"
                        style={{ background: color }}
                      >
                        {statusKey === "open" ? "Request Access" : "Book a Slot"}
                      </button>
                    ) : null}
                    {a.shared_billing_enabled ? <AmenityResidentBills amenity={a} /> : null}
                  </div>
                </div>
              );
            };

            if (amenities.length === 0) {
              return (
                <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
                  No facilities published yet. Your community admin will add amenities here.
                </div>
              );
            }

            if (mine.length === 0 && others.length === 0) {
              return (
                <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">
                  No amenities match your search.
                </div>
              );
            }

            return (
              <>
                {mine.length > 0 ? (
                  <div>
                    <h3 className="mb-3 text-sm font-bold text-slate-900">Your Amenities</h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {mine.map((a, idx) => renderCard(a, idx, true))}
                    </div>
                  </div>
                ) : null}
                {others.length > 0 ? (
                  <div>
                    <h3 className="mb-3 text-sm font-bold text-slate-900">
                      {mine.length > 0 ? "Community Amenities" : "Amenities"}
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {others.map((a, idx) => renderCard(a, idx, false))}
                    </div>
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>
      )}

      {tab === "services" && <UnitServiceWorkspace />}

      {/* ── Community Rules ── */}
      {tab === "rules" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {RULES.map((r, i) => (
            <div key={i} className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#0D9488] [&_svg]:h-4 [&_svg]:w-4">
                {r.icon}
              </div>
              <div>
                <p className="text-[13.5px] font-bold text-slate-900">{r.title}</p>
                <p className="mt-0.5 text-[12.5px] text-slate-500 leading-relaxed">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── My Bookings ── */}
      {tab === "bookings" && (
        <div className="space-y-3">
          {bookings.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white py-12 text-center shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 [&_svg]:h-5 [&_svg]:w-5"><IcoClock /></div>
              <p className="text-[13.5px] font-medium text-slate-500">No bookings yet.</p>
              <button onClick={() => setTab("amenities")} className="nl-btn-primary">Browse Amenities</button>
            </div>
          ) : bookings.map((b, idx) => {
            const color = AMENITY_COLOR[idx % AMENITY_COLOR.length];
            const statusColor = b.status === "confirmed" ? "#0D9488" : b.status === "cancelled" ? "#dc2626" : "#d97706";
            return (
              <div key={b.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white [&_svg]:h-5 [&_svg]:w-5"
                  style={{ background: color }}>
                  <IcoCalendar />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{b.amenity_name}</p>
                  <p className="text-[12.5px] text-slate-500">
                    {b.date} · {b.time_slot}
                    {Number(b.booking_fee ?? 0) > 0 ? ` · Fee ${formatUsdAmount(b.booking_fee)}` : ""}
                  </p>
                  {b.status === "rejected" && b.rejection_reason ? (
                    <p className="mt-1 text-[12px] text-rose-600">{b.rejection_reason}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold capitalize"
                    style={{ background: `${statusColor}18`, color: statusColor }}>
                    {b.status}
                  </span>
                  {b.status !== "cancelled" && b.status !== "rejected" && b.can_cancel !== false && (
                    <button onClick={() => handleCancelBooking(b)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 [&_svg]:h-3.5 [&_svg]:w-3.5">
                      <IcoX />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <button onClick={() => setTab("amenities")}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0D9488] hover:text-[#0A2A43] transition">
            <IcoPlus /> Book another amenity
          </button>
        </div>
      )}

      {/* Creator inbox */}
      {tab === "inbox" && (
        <div className="space-y-3">
          {inbox.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400 shadow-sm">
              No booking requests for amenities you created.
            </div>
          ) : (
            inbox.map((b) => {
              const statusColor =
                b.status === "confirmed" ? "#0D9488" : b.status === "rejected" || b.status === "cancelled" ? "#dc2626" : "#d97706";
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900">{b.amenity_name}</p>
                    <p className="text-[12.5px] text-slate-500">
                      {b.user_name || "Resident"}
                      {b.user_unit ? ` · Unit ${b.user_unit}` : ""} · {b.date}
                      {b.time_slot ? ` · ${b.time_slot}` : " · Open access"}
                      {Number(b.booking_fee ?? 0) > 0 ? ` · ${formatUsdAmount(b.booking_fee)}` : ""}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold capitalize"
                    style={{ background: `${statusColor}18`, color: statusColor }}
                  >
                    {b.status === "confirmed" ? "Approved" : b.status}
                  </span>
                  {b.status === "pending" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                        onClick={async () => {
                          try {
                            await rejectBooking(b.id);
                            toastSuccess("Request declined.");
                            loadData();
                          } catch (err) {
                            toastError(apiError(err));
                          }
                        }}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-[#0D9488]"
                        onClick={async () => {
                          try {
                            await approveBooking(b.id);
                            toastSuccess("Request approved.");
                            loadData();
                          } catch (err) {
                            toastError(apiError(err));
                          }
                        }}
                      >
                        Approve
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      )}

      <AmenityFormModal
        open={createOpen}
        mode="create"
        submitting={submitting}
        onClose={() => {
          if (!submitting) setCreateOpen(false);
        }}
        onSubmit={async (payload) => {
          setSubmitting(true);
          try {
            await createResidentAmenity(payload);
            toastSuccess("Amenity submitted for community admin approval.");
            setCreateOpen(false);
            loadData();
          } catch (err) {
            toastError(apiError(err));
          } finally {
            setSubmitting(false);
          }
        }}
      />

      {/* Book modal */}
      {bookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">
                  {bookModal.status === "open" ? "Request" : "Book"} {bookModal.name}
                </h3>
                <p className="mt-0.5 text-[12.5px] text-slate-500">
                  {bookModal.status === "open"
                    ? "No time slot needed — the creator will review your request."
                    : "Pick a generated slot for your visit."}
                </p>
              </div>
              <button onClick={() => setBookModal(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 [&_svg]:h-4 [&_svg]:w-4">
                <IcoX />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div>
                <label className="nl-label">Date</label>
                <input
                  type="date"
                  value={bookForm.date}
                  onChange={(e) => setBookForm((f) => ({ ...f, date: e.target.value }))}
                  className="nl-input mt-1.5"
                />
              </div>
              {bookModal.status === "bookable" ? (
                <div>
                  <label className="nl-label">Available slots</label>
                  <AmenitySlotPicker
                    loading={slotsLoading}
                    slots={slots}
                    message={slotsMessage}
                    selected={bookForm.slot}
                    tone="teal"
                    fullSlot={isFullSlotCapacity(bookModal.capacity_booking_type)}
                    onSelect={(value) =>
                      setBookForm((f) => {
                        const fullSlotBooking = isFullSlotCapacity(bookModal.capacity_booking_type);
                        if (fullSlotBooking) return { ...f, slot: value, guests: "1" };
                        const item = slots.find((slotItem) => slotItem.value === value);
                        const max = maxBookableSeats({
                          capacity: bookModal.capacity,
                          remaining: item?.remaining,
                          remainingForward: item?.remaining_forward,
                        });
                        const nextGuests = Math.min(Math.max(1, parseInt(f.guests, 10) || 1), max);
                        return { ...f, slot: value, guests: String(nextGuests) };
                      })
                    }
                  />
                </div>
              ) : null}
              {isFullSlotCapacity(bookModal.capacity_booking_type) && bookModal.status === "bookable" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">This books the entire slot</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Capacity is {Number(bookModal.capacity) || 0}. Other residents will not be able to book this time.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="nl-label">How many guests are you booking?</label>
                  {(() => {
                    const selected = slots.find((s) => s.value === bookForm.slot);
                    const max = maxBookableSeats({
                      capacity: bookModal.capacity,
                      remaining: bookModal.status === "bookable" ? selected?.remaining : bookModal.capacity,
                      remainingForward: selected?.remaining_forward,
                    });
                    const guestCount = Math.max(1, parseInt(bookForm.guests, 10) || 1);
                    return (
                      <>
                        {bookModal.status === "bookable" && bookForm.slot && max <= 24 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {Array.from({ length: max }, (_, index) => index + 1).map((count) => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => setBookForm((f) => ({ ...f, guests: String(count) }))}
                                className={[
                                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                                  guestCount === count
                                    ? "border-teal-500 bg-teal-50 text-[#0A2A43]"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                                ].join(" ")}
                              >
                                {count} {count === 1 ? "guest" : "guests"}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <input
                            type="number"
                            min="1"
                            max={max}
                            value={bookForm.guests}
                            onChange={(e) => setBookForm((f) => ({ ...f, guests: e.target.value }))}
                            className="nl-input mt-1.5"
                            placeholder="1"
                          />
                        )}
                        <p className="mt-1 text-xs text-slate-400">
                          {bookModal.status === "bookable" && bookForm.slot
                            ? selected?.remaining != null &&
                              selected.remaining_forward != null &&
                              selected.remaining_forward > selected.remaining
                              ? `${selected.remaining} left in this slot. Extra seats use the next available slots.`
                              : `Up to ${max} ${max === 1 ? "guest" : "guests"} available from this slot`
                            : `Max ${max} guests`}
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
              {bookStep === "community_bank" ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  Your bank is connected. This community has not connected a receiving account, so this paid amenity cannot be booked yet.
                </p>
              ) : null}
              <BookingPaymentSummary
                amenityName={bookModal.name}
                date={bookForm.date}
                slot={bookModal.status === "bookable" ? bookForm.slot : "Open access"}
                fee={reservationFeeTotal(
                  bookModal.shared_billing_enabled ? 0 : bookingFeeAmount(bookModal.booking_fee),
                  Math.max(1, parseInt(bookForm.guests, 10) || 1),
                  isFullSlotCapacity(bookModal.capacity_booking_type) && bookModal.status === "bookable",
                  bookModal.status === "open",
                )}
                guests={Math.max(1, parseInt(bookForm.guests, 10) || 1)}
                unitFee={bookModal.shared_billing_enabled ? 0 : bookingFeeAmount(bookModal.booking_fee)}
                fullSlot={isFullSlotCapacity(bookModal.capacity_booking_type) && bookModal.status === "bookable"}
                openAccess={bookModal.status === "open"}
              />
              <BookingPaymentFields
                fee={bookStep === "proof" ? reservationFeeTotal(
                  bookModal.shared_billing_enabled ? 0 : bookingFeeAmount(bookModal.booking_fee),
                  Math.max(1, parseInt(bookForm.guests, 10) || 1),
                  isFullSlotCapacity(bookModal.capacity_booking_type) && bookModal.status === "bookable",
                  bookModal.status === "open",
                ) : 0}
                form={payment}
                errors={paymentErrors}
                showError={showError}
                onChange={(key, value) => setPayment((prev) => ({ ...prev, [key]: value }))}
                onBlur={(field) => touch(field)}
                bankAvailable={Boolean(achCapability?.can_pay_with_bank)}
                communityBankReady={Boolean(achCapability?.community.bank_connected)}
                bankLabel={bankAccountLabel(achCapability?.resident.account, achCapability?.resident.institution_name)}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4">
              <button onClick={() => setBookModal(null)} className="nl-btn-secondary w-full sm:w-auto">Cancel</button>
              <button
                disabled={submitting || plaidBusy || alreadyBookedDate || bookStep === "community_bank" || (bookModal.status === "bookable" && slotsLoading)}
                onClick={() => handleBook(bookModal)}
                className="nl-btn-primary w-full disabled:opacity-60 sm:w-auto"
              >
                {plaidBusy
                  ? "Opening Plaid…"
                  : submitting
                    ? "Submitting…"
                    : bookStep === "link"
                      ? "Continue to Plaid"
                      : bookStep === "charge"
                        ? `Pay ${formatUsdAmount(bookFee)} with bank`
                        : bookStep === "community_bank"
                          ? "Receiving account needed"
                          : bookModal.status === "bookable" && slotsLoading
                            ? "Loading slots…"
                          : "Submit request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Icons ─── */
function IcoSearch() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IcoClock()    { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoCalendar() { return <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoPlus()     { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoX()        { return <svg viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
function IcoMoon()     { return <svg viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>; }
function IcoPet()      { return <svg viewBox="0 0 24 24" fill="none"><circle cx="7" cy="9" r="2" stroke="currentColor" strokeWidth="1.7"/><circle cx="17" cy="9" r="2" stroke="currentColor" strokeWidth="1.7"/><ellipse cx="12" cy="17" rx="5" ry="4" stroke="currentColor" strokeWidth="1.7"/></svg>; }
function IcoUser()     { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoClean()    { return <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoCar()      { return <svg viewBox="0 0 24 24" fill="none"><path d="M5 17H3v-6l2-4h14l2 4v6h-2M5 17a2 2 0 104 0 2 2 0 00-4 0zm10 0a2 2 0 104 0 2 2 0 00-4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>; }
function IcoWrench()   { return <svg viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>; }
