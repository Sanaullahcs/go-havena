/** Build Property Management hub activity from live API data (role-aware). */

const RESIDENT_STATUSES = new Set(["pending", "confirmed", "rejected"]);
const ACTIVITY_LIMIT = 3;

function todayKey() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(
    t.getDate(),
  ).padStart(2, "0")}`;
}

function bookingDateKey(booking) {
  return String(booking?.date ?? booking?.starts_at ?? "").slice(0, 10);
}

function bookingSortKey(booking) {
  return String(booking?.updated_at ?? booking?.created_at ?? bookingDateKey(booking) ?? "");
}

function parseLocalDate(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** @param {string} dateStr YYYY-MM-DD @param {string} [timeSlot] */
export function formatBookingActivityMeta(dateStr, timeSlot) {
  if (!dateStr) return "Date TBD";

  const date = parseLocalDate(dateStr);
  if (!date) return dateStr;

  const today = parseLocalDate(todayKey());
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);

  let dayLabel;
  if (diffDays === 0) dayLabel = "Today";
  else if (diffDays === 1) dayLabel = "Tomorrow";
  else if (diffDays === -1) dayLabel = "Yesterday";
  else {
    dayLabel = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  return timeSlot ? `${dayLabel}, ${timeSlot}` : dayLabel;
}

export function pickUnacknowledgedRule(rules = []) {
  return rules.find((rule) => rule?.needs_action) ?? null;
}

/** Recent resident bookings in pending / confirmed / rejected — newest first. */
export function pickResidentRecentBookings(bookings = [], limit = ACTIVITY_LIMIT) {
  return [...bookings]
    .filter((booking) => RESIDENT_STATUSES.has(booking?.status))
    .sort((a, b) => bookingSortKey(b).localeCompare(bookingSortKey(a)))
    .slice(0, limit);
}

/** Pending amenity requests waiting on admin approval — soonest date first. */
export function pickAdminPendingBookings(bookings = [], limit = ACTIVITY_LIMIT) {
  return [...bookings]
    .filter((booking) => booking?.status === "pending")
    .sort((a, b) => {
      const byDate = bookingDateKey(a).localeCompare(bookingDateKey(b));
      if (byDate !== 0) return byDate;
      return bookingSortKey(b).localeCompare(bookingSortKey(a));
    })
    .slice(0, limit);
}

function residentBookingCard(booking) {
  const amenityName = booking.amenity?.name ?? booking.amenity_name ?? "Amenity";
  const status = booking.status;
  const meta = formatBookingActivityMeta(booking.date ?? booking.starts_at, booking.time_slot);

  if (status === "pending") {
    return {
      id: `booking-${booking.id}`,
      type: "pending",
      key: "bookings",
      title: amenityName,
      meta,
      note: "Awaiting owner approval",
      badge: "Pending",
      routeKey: "MY_BOOKING",
    };
  }

  if (status === "rejected") {
    return {
      id: `booking-${booking.id}`,
      type: "danger",
      key: "bookings",
      title: amenityName,
      meta,
      note: booking.rejection_reason
        ? String(booking.rejection_reason)
        : "Your request was not approved. You can book another time.",
      badge: "Declined",
      routeKey: "MY_BOOKING",
    };
  }

  // confirmed / approved
  return {
    id: `booking-${booking.id}`,
    type: "success",
    key: "bookings",
    title: amenityName,
    meta,
    note: "Reservation confirmed",
    badge: "Approved",
    routeKey: "MY_BOOKING",
  };
}

function adminPendingCard(booking) {
  const amenityName = booking.amenity?.name ?? booking.amenity_name ?? "Amenity";
  const residentName = booking.user_name ?? booking.resident_name ?? "Resident";
  const unit = booking.user_unit ? ` · Unit ${booking.user_unit}` : "";

  return {
    id: `pending-${booking.id}`,
    type: "approval",
    key: "bookings",
    title: amenityName,
    meta: `${residentName}${unit}`,
    note: formatBookingActivityMeta(booking.date ?? booking.starts_at, booking.time_slot),
    badge: "Pending",
    linkLabel: "Approve",
    routeKey: "ADMIN_BOOKINGS",
  };
}

function pendingAmenityReviewCard(amenity) {
  return {
    id: `amenity-review-${amenity.id}`,
    type: "approval",
    key: "amenity",
    title: amenity.name ?? "Amenity",
    meta: amenity.creator_name ? `Submitted by ${amenity.creator_name}` : "Resident submission",
    note: "Needs publish approval before it goes live",
    badge: "Review",
    linkLabel: "Review",
    routeKey: "ADMIN_AMENITIES",
  };
}

/**
 * Resident hub — split incoming approvals from outgoing reservations.
 * @returns {{ incoming: { title: string, items: object[] }, outgoing: { title: string, items: object[] } }}
 */
export function buildResidentHubActivity({
  inbox = [],
  bookings = [],
  limit = ACTIVITY_LIMIT,
} = {}) {
  const incoming = pickAdminPendingBookings(inbox, limit).map(adminPendingCard);
  // Hub preview shows only the latest reservation; full list is on My Reservations.
  const outgoingItems = pickResidentRecentBookings(bookings, 1).map(residentBookingCard);

  return {
    incoming: {
      title: "Requests to approve",
      items: incoming,
    },
    outgoing: {
      title: "Your reservations",
      items: outgoingItems,
    },
  };
}

/**
 * @param {{ bookings?: object[], amenities?: object[], isAdmin?: boolean, limit?: number }} input
 * @returns {{ title: string, items: object[] }}
 */
export function buildPropertyHubActivity({
  bookings = [],
  amenities = [],
  isAdmin = false,
  limit = ACTIVITY_LIMIT,
} = {}) {
  if (isAdmin) {
    const pendingAmenities = amenities
      .filter((a) => a?.review_status === "pending")
      .slice(0, limit)
      .map(pendingAmenityReviewCard);
    const remaining = Math.max(0, limit - pendingAmenities.length);
    const pendingBookings = pickAdminPendingBookings(bookings, remaining).map(adminPendingCard);
    return {
      title: "Approval queue",
      items: [...pendingAmenities, ...pendingBookings],
    };
  }

  const resident = buildResidentHubActivity({ inbox: [], bookings, limit });
  return {
    title: resident.outgoing.title,
    items: resident.outgoing.items,
  };
}

/** @deprecated Prefer buildPropertyHubActivity — kept for older imports in tests. */
export function pickNextUpcomingBooking(bookings = []) {
  const today = todayKey();
  return (
    [...bookings]
      .filter((booking) => {
        const status = booking?.status;
        const isActive = status === "pending" || status === "confirmed";
        return isActive && bookingDateKey(booking) >= today;
      })
      .sort((a, b) => bookingDateKey(a).localeCompare(bookingDateKey(b)))[0] ?? null
  );
}
