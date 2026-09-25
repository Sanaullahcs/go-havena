/** Visual + status helpers for the amenities module (Lucide icon keys). */

import i18n from "../i18n";
import { getLocaleForLang } from "../hooks/use-app-locale";

const VISUALS = [
  { key: "gym", match: ["gym", "workout", "gymnasium"], tint: "#DB2777", soft: "#FCE7F3", labelKey: "amenities.types.gym" },
  { key: "yoga", match: ["yoga", "fitness", "pilates"], tint: "#BE185D", soft: "#FDF2F8", labelKey: "amenities.types.yoga" },
  { key: "pool", match: ["pool", "swim"], tint: "#0284C7", soft: "#E0F2FE", labelKey: "amenities.types.pool" },
  { key: "laundry", match: ["laundry"], tint: "#0D9488", soft: "#F0FDFA", labelKey: "amenities.types.laundry" },
  { key: "car_wash", match: ["car wash", "carwash"], tint: "#475569", soft: "#F1F5F9", labelKey: "amenities.types.carWash" },
  { key: "barber", match: ["barber", "salon", "hair"], tint: "#B45309", soft: "#FEF3C7", labelKey: "amenities.types.barber" },
  { key: "cleaning", match: ["personal clean", "maid", "housekeep"], tint: "#0F766E", soft: "#CCFBF1", labelKey: "amenities.types.cleaning" },
  { key: "sports", match: ["sport", "tennis", "basketball", "court"], tint: "#059669", soft: "#ECFDF5", labelKey: "amenities.types.sports" },
  { key: "events", match: ["event", "activity", "participation"], tint: "#7C3AED", soft: "#F5F3FF", labelKey: "amenities.types.events" },
  { key: "package", match: ["package", "parcel", "courier"], tint: "#1D4ED8", soft: "#DBEAFE", labelKey: "amenities.types.package" },
  { key: "lounge", match: ["lounge", "community", "clubhouse", "hall"], tint: "#1B4F8A", soft: "#E8F0F7", labelKey: "amenities.types.lounge" },
  { key: "other", match: ["other", "custom"], tint: "#64748B", soft: "#F1F5F9", labelKey: "amenities.types.other" },
];

const LEGACY_VISUALS = [
  { key: "hall", match: ["hall", "party"], tint: "#6366F1", soft: "#D1FAF5", labelKey: "amenities.types.hall" },
  { key: "meeting", match: ["meeting", "conference"], tint: "#1B4F8A", soft: "#D1FAF5", labelKey: "amenities.types.meeting" },
  { key: "dining", match: ["bbq", "grill", "kitchen", "dining"], tint: "#EA580C", soft: "#FFF7ED", labelKey: "amenities.types.dining" },
  { key: "playground", match: ["kid", "playground", "child", "play"], tint: "#D97706", soft: "#FEF3C7", labelKey: "amenities.types.play" },
  { key: "terrace", match: ["garden", "park", "roof", "terrace", "outdoor"], tint: "#16A34A", soft: "#F0FDF4", labelKey: "amenities.types.outdoor" },
  { key: "spa", match: ["spa", "sauna", "wellness"], tint: "#BE185D", soft: "#FDF2F8", labelKey: "amenities.types.wellness" },
  { key: "library", match: ["library", "study", "reading"], tint: "#4F46E5", soft: "#D1FAF5", labelKey: "amenities.types.study" },
  { key: "parking", match: ["parking", "garage"], tint: "#475569", soft: "#F1F5F9", labelKey: "amenities.types.parking" },
  { key: "cinema", match: ["cinema", "theater", "theatre", "movie"], tint: "#7C3AED", soft: "#F5F3FF", labelKey: "amenities.types.cinema" },
  { key: "bike", match: ["bike", "cycle", "bicycle"], tint: "#14B8A6", soft: "#D1FAF5", labelKey: "amenities.types.bike" },
];

const DEFAULT_VISUAL = {
  key: "building",
  tint: "#1B4F8A",
  soft: "#D1FAF5",
  labelKey: "amenities.types.building",
};

const ALL_VISUALS = [...VISUALS, ...LEGACY_VISUALS];

/** Fixed Lucide catalog for the admin icon picker. */
export const AMENITY_ICON_CATALOG = VISUALS.map(({ key, tint, soft, labelKey }) => ({
  key,
  tint,
  soft,
  labelKey,
  get label() { return i18n.t(labelKey); },
}));

export const AMENITY_ICON_KEYS = [
  ...VISUALS.map((v) => v.key),
  ...LEGACY_VISUALS.map((v) => v.key),
  DEFAULT_VISUAL.key,
];

export function getAmenityVisual(name = "", iconKey = null) {
  if (iconKey) {
    const byKey = ALL_VISUALS.find((v) => v.key === iconKey)
      ?? (iconKey === DEFAULT_VISUAL.key ? DEFAULT_VISUAL : null);
    if (byKey) return { ...byKey, get label() { return i18n.t(byKey.labelKey); } };
  }
  const n = String(name).toLowerCase();
  const found = ALL_VISUALS.find((v) => v.match.some((m) => n.includes(m)));
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

  if (status === "bookable") {
    if (capacityRaw === "") errors.capacity = i18n.t("amenities.validation.capacityRequired");
    else {
      const capacity = Number(capacityRaw);
      if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) {
        errors.capacity = i18n.t("amenities.validation.capacityRange");
      }
    }
  } else if (capacityRaw !== "") {
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
  } else if (iconKey === "other" && !String(form.custom_category ?? "").trim()) {
    errors.custom_category = i18n.t("amenities.validation.customCategoryRequired");
  }

  if (!form.shared_billing_enabled) {
    const charge = form.booking_charge === "paid" || Number(form.booking_fee) > 0 ? "paid" : "free";
    const feeRaw = String(form.booking_fee ?? "").trim();
    const fee = feeRaw === "" ? 0 : Number(feeRaw);
    if (charge === "paid") {
      if (!feeRaw || !Number.isFinite(fee) || fee <= 0) {
        errors.booking_fee = i18n.t("amenities.validation.bookingFeeRequired");
      } else if (status === "closed") {
        errors.booking_fee = i18n.t("amenities.validation.bookingFeeRequiresBookable");
      }
    } else if (feeRaw !== "" && (!Number.isFinite(fee) || fee < 0)) {
      errors.booking_fee = i18n.t("amenities.validation.bookingFeeInvalid");
    } else if (status === "closed" && fee > 0) {
      errors.booking_fee = i18n.t("amenities.validation.bookingFeeRequiresBookable");
    }
  }

  if (form.shared_billing_enabled) {
    const amount = Number(form.shared_billing_amount);
    if (!String(form.shared_billing_amount ?? "").trim()) {
      errors.shared_billing_amount = i18n.t("amenities.validation.sharedAmountRequired");
    } else if (!Number.isFinite(amount) || amount < 0.01) {
      errors.shared_billing_amount = i18n.t("amenities.validation.sharedAmountInvalid");
    }

    const dueDay = Number(form.shared_billing_due_day);
    if (!String(form.shared_billing_due_day ?? "").trim()) {
      errors.shared_billing_due_day = i18n.t("amenities.validation.sharedDueDayRequired");
    } else if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      errors.shared_billing_due_day = i18n.t("amenities.validation.sharedDueDayInvalid");
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
    capacity: String(form.capacity ?? "").trim() === "" ? null : Number(form.capacity),
    floor: String(form.floor ?? "").trim(),
    icon_key: form.icon_key,
    custom_category: form.icon_key === "other" ? String(form.custom_category ?? "").trim() : null,
    weekends_available: Boolean(form.weekends_available),
    start_time: times?.start_time,
    end_time: times?.end_time,
    hours: String(form.hours ?? "").trim(),
    booking_fee: form.shared_billing_enabled || form.booking_charge === "free"
      ? 0
      : String(form.booking_fee ?? "").trim() === ""
        ? 0
        : Number(form.booking_fee),
    shared_billing_enabled: Boolean(form.shared_billing_enabled),
    shared_billing_type: form.shared_billing_enabled ? "all_residents" : null,
    shared_billing_frequency: form.shared_billing_enabled
      ? (form.shared_billing_frequency === "yearly" ? "yearly" : "monthly")
      : null,
    shared_billing_amount: form.shared_billing_enabled ? Number(form.shared_billing_amount) : null,
    shared_billing_due_day: form.shared_billing_enabled ? Number(form.shared_billing_due_day) : null,
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

export function amenityDisplayFee(amenity) {
  if (!amenity) return 0;
  if (amenity.shared_billing_enabled || amenity.display_fee_kind === "monthly" || amenity.display_fee_kind === "yearly") {
    return bookingFeeAmount(amenity.display_fee ?? amenity.shared_billing_amount);
  }
  return bookingFeeAmount(amenity.display_fee ?? amenity.booking_fee);
}

export function formatAmenityFeeLabel(amenity) {
  const amount = amenityDisplayFee(amenity);
  if (amount <= 0) return i18n.t("propertyMgmt.bookingAmountFree");
  const formatted = formatUsdAmount(amount);
  if (amenity?.shared_billing_enabled || amenity?.display_fee_kind === "monthly" || amenity?.display_fee_kind === "yearly") {
    const yearly = amenity?.display_fee_kind === "yearly" || amenity?.shared_billing_frequency === "yearly";
    return `${formatted} / ${yearly ? i18n.t("admin.sharedBillingYearly") : i18n.t("admin.sharedBillingMonthly")}`;
  }
  return formatted;
}

export function formatBookingDisplayFee(booking) {
  const amount = bookingFeeAmount(booking?.display_fee ?? booking?.booking_fee);
  if (amount <= 0) return i18n.t("propertyMgmt.bookingAmountFree");
  const formatted = formatUsdAmount(amount);
  if (booking?.display_fee_kind === "yearly") return `${formatted} / ${i18n.t("admin.sharedBillingYearly")}`;
  if (booking?.display_fee_kind === "monthly") return `${formatted} / ${i18n.t("admin.sharedBillingMonthly")}`;
  return formatted;
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
