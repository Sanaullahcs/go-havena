/** Build Property Management hub activity from live API data (role-aware). */
import i18n, { localizedField } from "../i18n";
import { getLocaleForLang } from "../hooks/use-app-locale";

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
  if (!dateStr) return i18n.t("time.dateTBD");

  const date = parseLocalDate(dateStr);
  if (!date) return dateStr;

  const today = parseLocalDate(todayKey());
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);

  let dayLabel;
  if (diffDays === 0) dayLabel = i18n.t("time.today");
  else if (diffDays === 1) dayLabel = i18n.t("time.tomorrow");
  else if (diffDays === -1) dayLabel = i18n.t("time.yesterday");
  else {
    dayLabel = date.toLocaleDateString(getLocaleForLang(i18n.language), {
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
  const amenityName = localizedField(booking.amenity ?? booking, "amenity_name") || localizedField(booking.amenity ?? {}, "name") || i18n.t("services.amenity");
  const status = booking.status;
  const meta = formatBookingActivityMeta(booking.date ?? booking.starts_at, booking.time_slot);

  if (status === "pending") {
    return {
      id: `booking-${booking.id}`,
      type: "pending",
      key: "bookings",
      title: amenityName,
      meta,
      note: i18n.t("services.activity.awaitingApproval"),
      badge: i18n.t("services.activity.pending"),
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
        : i18n.t("services.activity.notApproved"),
      badge: i18n.t("services.activity.declined"),
      routeKey: "MY_BOOKING",
    };
  }

  return {
    id: `booking-${booking.id}`,
    type: "success",
    key: "bookings",
    title: amenityName,
    meta,
    note: i18n.t("services.activity.confirmed"),
    badge: i18n.t("services.activity.approved"),
    routeKey: "MY_BOOKING",
  };
}

function adminPendingCard(booking) {
  const amenityName = localizedField(booking.amenity ?? booking, "amenity_name") || localizedField(booking.amenity ?? {}, "name") || i18n.t("services.amenity");
  const residentName = booking.user_name ?? booking.resident_name ?? i18n.t("roles.resident");
  const unit = booking.user_unit ? ` · ${i18n.t("profile.unit")} ${booking.user_unit}` : "";

  return {
    id: `pending-${booking.id}`,
    type: "approval",
    key: "bookings",
    iconKey: "bookingRequest",
    title: amenityName,
    meta: `${residentName}${unit}`,
    note: formatBookingActivityMeta(booking.date ?? booking.starts_at, booking.time_slot),
    badge: i18n.t("services.activity.pending"),
    linkLabel: i18n.t("services.activity.approve"),
    routeKey: "ADMIN_BOOKINGS",
  };
}

function pendingAmenityReviewCard(amenity) {
  return {
    id: `amenity-review-${amenity.id}`,
    type: "approval",
    key: "amenity",
    iconKey: "amenityReview",
    title: localizedField(amenity, "name") || i18n.t("services.amenity"),
    meta: amenity.creator_name ? i18n.t("services.activity.submittedBy", { name: amenity.creator_name }) : i18n.t("services.activity.residentSubmission"),
    note: i18n.t("services.activity.needsApproval"),
    badge: i18n.t("services.activity.review"),
    linkLabel: i18n.t("services.activity.review"),
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
      title: i18n.t("services.activity.requestsToApprove"),
      items: incoming,
    },
    outgoing: {
      title: i18n.t("services.activity.yourReservations"),
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
      title: i18n.t("services.activity.approvalQueue"),
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
