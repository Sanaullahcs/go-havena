/** Visual + status helpers for the amenities module (Lucide icon keys). */

import i18n from "../i18n";
import { getLocaleForLang } from "../hooks/use-app-locale";

const VISUALS = [
  { key: "pool", match: ["pool", "swim"], tint: "#0284C7", soft: "#E0F2FE", labelKey: "amenities.types.pool" },
  { key: "gym", match: ["gym", "fitness", "workout"], tint: "#DB2777", soft: "#FCE7F3", labelKey: "amenities.types.gym" },
  { key: "hall", match: ["hall", "party", "event", "lounge", "community", "clubhouse"], tint: "#6366F1", soft: "#D1FAF5", labelKey: "amenities.types.hall" },
  { key: "meeting", match: ["meeting", "conference", "business", "office", "co-work", "cowork"], tint: "#1B4F8A", soft: "#D1FAF5", labelKey: "amenities.types.meeting" },
  { key: "dining", match: ["bbq", "grill", "kitchen", "dining", "cafe", "restaurant"], tint: "#EA580C", soft: "#FFF7ED", labelKey: "amenities.types.dining" },
  { key: "sports", match: ["tennis", "court", "sport", "basketball", "court"], tint: "#059669", soft: "#ECFDF5", labelKey: "amenities.types.sports" },
  { key: "playground", match: ["kid", "playground", "child", "play"], tint: "#D97706", soft: "#FEF3C7", labelKey: "amenities.types.play" },
  { key: "terrace", match: ["garden", "park", "green", "roof", "terrace", "outdoor"], tint: "#16A34A", soft: "#F0FDF4", labelKey: "amenities.types.outdoor" },
  { key: "spa", match: ["spa", "sauna", "wellness", "yoga"], tint: "#BE185D", soft: "#FDF2F8", labelKey: "amenities.types.wellness" },
  { key: "library", match: ["library", "study", "reading"], tint: "#4F46E5", soft: "#D1FAF5", labelKey: "amenities.types.study" },
  { key: "parking", match: ["parking", "garage", "car"], tint: "#475569", soft: "#F1F5F9", labelKey: "amenities.types.parking" },
  { key: "laundry", match: ["laundry", "wash"], tint: "#0D9488", soft: "#F0FDFA", labelKey: "amenities.types.laundry" },
  { key: "cinema", match: ["cinema", "theater", "theatre", "movie"], tint: "#7C3AED", soft: "#F5F3FF", labelKey: "amenities.types.cinema" },
  { key: "bike", match: ["bike", "cycle", "bicycle"], tint: "#14B8A6", soft: "#D1FAF5", labelKey: "amenities.types.bike" },
];

const DEFAULT_VISUAL = {
  key: "building",
  tint: "#1B4F8A",
  soft: "#D1FAF5",
  labelKey: "amenities.types.building",
};

/** Fixed Lucide catalog for the admin icon picker. */
export const AMENITY_ICON_CATALOG = [
  ...VISUALS.map(({ key, tint, soft, labelKey }) => ({ key, tint, soft, labelKey, get label() { return i18n.t(labelKey); } })),
  { ...DEFAULT_VISUAL, get label() { return i18n.t(DEFAULT_VISUAL.labelKey); } },
];

export const AMENITY_ICON_KEYS = AMENITY_ICON_CATALOG.map((v) => v.key);

export function getAmenityVisual(name = "", iconKey = null) {
  if (iconKey) {
    const byKey = AMENITY_ICON_CATALOG.find((v) => v.key === iconKey);
    if (byKey) return byKey;
  }
  const n = String(name).toLowerCase();
  const found = VISUALS.find((v) => v.match.some((m) => n.includes(m)));
  const base = found ?? DEFAULT_VISUAL;
  return { ...base, get label() { return i18n.t(base.labelKey); } };
}

export function getAmenityStatus(status) {
  switch (status) {
    case "bookable":
      return {
        label: i18n.t("amenities.timedSlots"),
        color: "#B45309",
        bg: "#FEF3C7",
        dot: "#F59E0B",
        bookable: true,
        needsSlot: true,
      };
    case "closed":
      return {
        label: i18n.t("amenities.closed"),
        color: "#B91C1C",
        bg: "#FEF2F2",
        dot: "#EF4444",
        bookable: false,
        needsSlot: false,
      };
    case "open":
    default:
      return {
        label: i18n.t("amenities.openAvailability"),
        color: "#047857",
        bg: "#ECFDF5",
        dot: "#10B981",
        bookable: true,
        needsSlot: false,
      };
  }
}

export const SLOT_DURATION_OPTIONS = [
  { value: 30, get label() { return i18n.t("amenities.slot30min"); } },
  { value: 60, get label() { return i18n.t("amenities.slot1hr"); } },
  { value: 90, get label() { return i18n.t("amenities.slot1_5hr"); } },
  { value: 120, get label() { return i18n.t("amenities.slot2hr"); } },
];

/** Parse "9:00 AM - 5:00 PM" into { start_time: "09:00", end_time: "17:00" }. */
export function parseHoursToApiTimes(hours) {
  const parts = String(hours ?? "").split(/\s*[–-]\s*/);
  if (parts.length < 2) return null;
  const start = parseDisplayTimeToHHmm(parts[0].trim());
  const end = parseDisplayTimeToHHmm(parts[1].trim());
  if (!start || !end) return null;
  return { start_time: start, end_time: end };
}

function parseDisplayTimeToHHmm(str) {
  const match = String(str).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (!meridiem && hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

const MINUTES_PER_DAY = 1440;

function wrapMinutes(total) {
  const wrapped = total % MINUTES_PER_DAY;
  return wrapped < 0 ? wrapped + MINUTES_PER_DAY : wrapped;
}

function formatMinutesLabel(total) {
  const wrapped = wrapMinutes(total);
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12}:00 ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function formatMinutesClock(total) {
  const wrapped = wrapMinutes(total);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Generate slots from start/end (HH:mm) and duration minutes. Overnight close (end <= start) wraps to the next day. */
export function generateAmenitySlots(startTime, endTime, durationMinutes) {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  const duration = Number(durationMinutes);
  if (start == null || end == null || !duration || duration < 15) return [];
  if (end <= start) end += MINUTES_PER_DAY;

  const slots = [];
  for (let cursor = start; cursor + duration <= end; cursor += duration) {
    const from = formatMinutesLabel(cursor);
    const to = formatMinutesLabel(cursor + duration);
    slots.push({
      label: from,
      value: `${from} - ${to}`,
      start: formatMinutesClock(cursor),
      end: formatMinutesClock(cursor + duration),
      start_day_offset: Math.floor(cursor / MINUTES_PER_DAY),
      end_day_offset: Math.floor((cursor + duration) / MINUTES_PER_DAY),
    });
  }
  return slots;
}

/** Client-side create/edit validation. Returns field -> message map. */
export function validateAmenityForm(form) {
  const errors = {};
  const name = String(form.name ?? "").trim();
  const description = String(form.description ?? "").trim();
  const capacityRaw = String(form.capacity ?? "").trim();
  const floor = String(form.floor ?? "").trim();
  const hours = String(form.hours ?? "").trim();
  const status = form.status;
  const iconKey = form.icon_key;
  const weekends = form.weekends_available;
  const slotDuration = Number(form.slot_duration_minutes);

  if (!name) errors.name = i18n.t("amenities.validation.nameRequired");
  else if (name.length < 2) errors.name = i18n.t("amenities.validation.nameMinLength");
  else if (name.length > 100) errors.name = i18n.t("amenities.validation.nameMaxLength");

  if (description.length > 2000) errors.description = i18n.t("amenities.validation.descriptionTooLong");

  if (!["open", "bookable", "closed"].includes(status)) {
    errors.status = i18n.t("amenities.validation.statusRequired");
  }

  if (capacityRaw === "") errors.capacity = i18n.t("amenities.validation.capacityRequired");
  else {
    const capacity = Number(capacityRaw);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) {
      errors.capacity = i18n.t("amenities.validation.capacityRange");
    }
  }

  if (!floor) errors.floor = i18n.t("amenities.validation.locationRequired");
  else if (floor.length > 40) errors.floor = i18n.t("amenities.validation.locationMaxLength");

  if (!hours) errors.hours = i18n.t("amenities.validation.hoursRequired");
  else if (!parseHoursToApiTimes(hours)) errors.hours = i18n.t("amenities.validation.hoursInvalid");

  if (typeof weekends !== "boolean") {
    errors.weekends_available = i18n.t("amenities.validation.weekendsRequired");
  }

  if (status === "bookable") {
    if (![30, 60, 90, 120].includes(slotDuration)) {
      errors.slot_duration_minutes = i18n.t("amenities.validation.slotDurationRequired");
    } else {
      const times = parseHoursToApiTimes(hours);
      if (times && generateAmenitySlots(times.start_time, times.end_time, slotDuration).length === 0) {
        errors.slot_duration_minutes = i18n.t("amenities.validation.slotDurationNoFit");
      }
    }
  }

  if (!iconKey || !AMENITY_ICON_KEYS.includes(iconKey)) {
    errors.icon_key = i18n.t("amenities.validation.categoryRequired");
  }

  const feeRaw = String(form.booking_fee ?? "").trim();
  if (feeRaw !== "") {
    const fee = Number(feeRaw);
    if (!Number.isFinite(fee) || fee < 0) {
      errors.booking_fee = i18n.t("amenities.validation.bookingFeeInvalid");
    }
  }

  return errors;
}

/** Build API payload from the amenity form. */
export function buildAmenityPayload(form) {
  const times = parseHoursToApiTimes(form.hours);
  const payload = {
    name: String(form.name ?? "").trim(),
    description: String(form.description ?? "").trim() || null,
    status: form.status,
    capacity: Number(form.capacity),
    floor: String(form.floor ?? "").trim(),
    icon_key: form.icon_key,
    weekends_available: Boolean(form.weekends_available),
    start_time: times?.start_time,
    end_time: times?.end_time,
    hours: String(form.hours ?? "").trim(),
    booking_fee: String(form.booking_fee ?? "").trim() === "" ? 0 : Number(form.booking_fee),
  };
  if (form.status === "bookable") {
    payload.slot_duration_minutes = Number(form.slot_duration_minutes);
  } else {
    payload.slot_duration_minutes = null;
  }
  return payload;
}

/** True when the amenity form has no validation errors. */
export function isAmenityFormReady(form) {
  return Object.keys(validateAmenityForm(form)).length === 0;
}

/** Next `count` days starting today, as { key(YYYY-MM-DD), weekday, day, month }. */
export function buildUpcomingDates(count = 14) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    out.push({
      key,
      date: d,
      weekday: d.toLocaleDateString(getLocaleForLang(i18n.language), { weekday: "short" }),
      day: String(d.getDate()),
      month: d.toLocaleDateString(getLocaleForLang(i18n.language), { month: "short" }),
      isToday: i === 0,
    });
  }
  return out;
}

function formatHour(h) {
  const suffix = h >= 12 && h < 24 ? "PM" : "AM";
  let display = h % 12;
  if (display === 0) display = 12;
  return `${display}:00 ${suffix}`;
}

/** Hourly slots between startHour and endHour as { label, value(range) }. */
export function buildTimeSlots(startHour = 8, endHour = 21) {
  const slots = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push({
      label: formatHour(h),
      value: `${formatHour(h)} – ${formatHour(h + 1)}`,
    });
  }
  return slots;
}

export function formatLongDate(dateKey) {
  if (!dateKey) return "";
  try {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(getLocaleForLang(i18n.language), {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateKey;
  }
}

export function todayDateKey() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;
}

export function isActiveBookingStatus(status) {
  return status === "pending" || status === "confirmed";
}

export function getUserActiveBookingsForAmenity(bookings, amenityId, { fromDateKey } = {}) {
  const from = fromDateKey ?? todayDateKey();
  return (bookings ?? []).filter(
    (b) =>
      Number(b.amenity_id) === Number(amenityId) &&
      isActiveBookingStatus(b.status) &&
      String(b.date ?? b.starts_at ?? "").slice(0, 10) >= from,
  );
}

export function hasUpcomingUserBooking(bookings, amenityId) {
  return getUserActiveBookingsForAmenity(bookings, amenityId).length > 0;
}

export function getNextUserBookingDate(bookings, amenityId) {
  const dates = getUserActiveBookingsForAmenity(bookings, amenityId)
    .map((b) => String(b.date ?? b.starts_at ?? "").slice(0, 10))
    .filter(Boolean)
    .sort();
  return dates[0] ?? null;
}

export function formatUsdAmount(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0";
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function bookingFeeAmount(value) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function isDateBookedByUser(bookings, amenityId, dateKey) {
  return (bookings ?? []).some(
    (b) =>
      Number(b.amenity_id) === Number(amenityId) &&
      isActiveBookingStatus(b.status) &&
      String(b.date ?? b.starts_at ?? "").slice(0, 10) === dateKey,
  );
}

export function enrichAmenityBookingState(amenity, myBookings = []) {
  const reservedDate =
    amenity.user_next_booking_date ?? getNextUserBookingDate(myBookings, amenity.id);
  const alreadyBooked = Boolean(
    amenity.user_has_upcoming_booking ?? hasUpcomingUserBooking(myBookings, amenity.id),
  );
  return {
    ...amenity,
    user_has_upcoming_booking: alreadyBooked,
    user_next_booking_date: reservedDate,
  };
}
