"use client";

import { useState, useEffect, useCallback } from "react";
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

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  open:     { bg: "#ecfdf5", text: "#059669", label: "Open availability", dot: "#10b981" },
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

const AMENITY_COLOR = ["#1B4F8A", "#dc2626", "#d97706", "#059669", "#7c3aed", "#0891b2"];

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function PropertyPage() {
  const [tab, setTab] = useState<"amenities" | "rules" | "bookings" | "inbox">("amenities");
  const [bookModal, setBookModal] = useState<Amenity | null>(null);
  const [bookForm, setBookForm] = useState({ date: tomorrowIso(), slot: "", guests: "1" });
  const [slots, setSlots] = useState<Array<AmenitySlot & { available?: boolean }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsMessage, setSlotsMessage] = useState<string | null>(null);
  const [alreadyBookedDate, setAlreadyBookedDate] = useState(false);

  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inbox, setInbox] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ams, bks, inboxRows] = await Promise.all([
        fetchAmenities(),
        fetchMyBookings(),
        fetchBookingInbox().catch(() => [] as Booking[]),
      ]);
      setAmenities(ams);
      setBookings(bks);
      setInbox(inboxRows);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!bookModal || bookModal.status !== "bookable" || !bookForm.date) {
      setSlots([]);
      setSlotsMessage(null);
      setAlreadyBookedDate(false);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
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
  }, [bookModal, bookForm.date]);

  const openBookModal = (amenity: Amenity) => {
    if (amenity.is_mine) {
      toastError("You cannot book an amenity you created. Manage requests in Approve Requests.");
      setTab("inbox");
      return;
    }
    setBookForm({ date: tomorrowIso(), slot: "", guests: "1" });
    setBookModal(amenity);
  };

  const handleBook = async (amenity: Amenity) => {
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
    const maxGuests = Math.max(1, Number(amenity.capacity) || 50);
    const guestCount = parseInt(bookForm.guests, 10) || 1;
    if (guestCount > maxGuests) {
      toastError(`This amenity allows up to ${maxGuests} guests.`);
      return;
    }

    const slotLabel =
      amenity.status === "bookable" ? bookForm.slot : "Open access request";
    const r = await confirmAction({
      title: `Request ${amenity.name}?`,
      text: `Date: ${bookForm.date}${amenity.status === "bookable" ? ` · ${slotLabel}` : ""} · Guests: ${guestCount}. The amenity creator will review your request.`,
      confirmText: "Submit request",
      color: "green",
    });
    if (!r.isConfirmed) return;

    setSubmitting(true);
    try {
      await createBooking({
        amenity_id: amenity.id,
        date: bookForm.date,
        ...(amenity.status === "bookable" ? { time_slot: bookForm.slot } : {}),
        guests: guestCount,
      });
      setBookModal(null);
      toastSuccess(`Request submitted for ${amenity.name}.`);
      loadData();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="nl-eyebrow" style={{ color: "#059669" }}>Your Home</p>
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
          { id: "rules" as const, label: "Rules" },
          { id: "bookings" as const, label: `My Reservations (${bookings.length})` },
          { id: "inbox" as const, label: `Approve Requests (${inbox.filter((b) => b.status === "pending").length})` },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "rounded-lg px-4 py-1.5 text-[13px] font-semibold transition",
              tab === t.id ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Amenities ── */}
      {tab === "amenities" && (
        <div className="space-y-6">
          {(() => {
            const mine = amenities.filter((a) => a.is_mine);
            const others = amenities.filter((a) => !a.is_mine);
            const renderCard = (a: Amenity, idx: number, owned: boolean) => {
              const statusKey = a.status?.toLowerCase() ?? "open";
              const st = STATUS_STYLE[statusKey] ?? STATUS_STYLE.open;
              const color = AMENITY_COLOR[idx % AMENITY_COLOR.length];
              const canRequest =
                !owned &&
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
                    ) : canRequest ? (
                      <button
                        onClick={() => openBookModal(a)}
                        className="mt-3 w-full rounded-xl py-2 text-[12.5px] font-bold text-white transition hover:opacity-90"
                        style={{ background: color }}
                      >
                        {statusKey === "open" ? "Request Access" : "Book a Slot"}
                      </button>
                    ) : null}
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

      {/* ── Community Rules ── */}
      {tab === "rules" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {RULES.map((r, i) => (
            <div key={i} className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 [&_svg]:h-4 [&_svg]:w-4">
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
            const statusColor = b.status === "confirmed" ? "#059669" : b.status === "cancelled" ? "#dc2626" : "#d97706";
            return (
              <div key={b.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white [&_svg]:h-5 [&_svg]:w-5"
                  style={{ background: color }}>
                  <IcoCalendar />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{b.amenity_name}</p>
                  <p className="text-[12.5px] text-slate-500">{b.date} · {b.time_slot}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold capitalize"
                    style={{ background: `${statusColor}18`, color: statusColor }}>
                    {b.status}
                  </span>
                  {b.status !== "cancelled" && (
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
            className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 transition">
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
                b.status === "confirmed" ? "#059669" : b.status === "rejected" || b.status === "cancelled" ? "#dc2626" : "#d97706";
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900">{b.amenity_name}</p>
                    <p className="text-[12.5px] text-slate-500">
                      {b.user_name || "Resident"}
                      {b.user_unit ? ` · Unit ${b.user_unit}` : ""} · {b.date}
                      {b.time_slot ? ` · ${b.time_slot}` : " · Open access"}
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
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
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
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200">
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
            <div className="space-y-4 px-6 py-5">
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
                  {slotsLoading ? (
                    <p className="mt-2 text-sm text-slate-400">Loading slots…</p>
                  ) : slotsMessage ? (
                    <p className="mt-2 text-sm text-amber-700">{slotsMessage}</p>
                  ) : slots.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">No open slots for this date.</p>
                  ) : (
                    <div className="mt-2 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                      {slots.map((slot) => {
                        const taken = slot.available === false;
                        const active = bookForm.slot === slot.value;
                        return (
                          <button
                            key={slot.value}
                            type="button"
                            disabled={taken}
                            onClick={() => setBookForm((f) => ({ ...f, slot: slot.value }))}
                            className={[
                              "rounded-xl border px-3 py-2 text-left text-[12.5px] font-semibold transition",
                              taken
                                ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                                : active
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                                  : "border-slate-200 text-slate-700 hover:border-slate-300",
                            ].join(" ")}
                          >
                            {slot.value}
                            {taken ? " · Taken" : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
              <div>
                <label className="nl-label">Number of Guests</label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, Number(bookModal.capacity) || 50)}
                  value={bookForm.guests}
                  onChange={(e) => setBookForm((f) => ({ ...f, guests: e.target.value }))}
                  className="nl-input mt-1.5"
                  placeholder="1"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Max {Math.max(1, Number(bookModal.capacity) || 50)} guests
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setBookModal(null)} className="nl-btn-secondary">Cancel</button>
              <button
                disabled={submitting || alreadyBookedDate}
                onClick={() => handleBook(bookModal)}
                className="nl-btn-primary disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Icons ─── */
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
