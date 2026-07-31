/** Visual + status helpers for the amenities module (Lucide icon keys). */

const VISUALS = [
  { key: "pool", match: ["pool", "swim"], tint: "#0284C7", soft: "#E0F2FE", label: "Pool" },
  { key: "gym", match: ["gym", "fitness", "workout"], tint: "#DB2777", soft: "#FCE7F3", label: "Gym" },
  { key: "hall", match: ["hall", "party", "event", "lounge", "community", "clubhouse"], tint: "#6366F1", soft: "#EEF2FF", label: "Hall" },
  { key: "meeting", match: ["meeting", "conference", "business", "office", "co-work", "cowork"], tint: "#0052DF", soft: "#EFF6FF", label: "Meeting" },
  { key: "dining", match: ["bbq", "grill", "kitchen", "dining", "cafe", "restaurant"], tint: "#EA580C", soft: "#FFF7ED", label: "Dining" },
  { key: "sports", match: ["tennis", "court", "sport", "basketball", "court"], tint: "#059669", soft: "#ECFDF5", label: "Sports" },
  { key: "playground", match: ["kid", "playground", "child", "play"], tint: "#D97706", soft: "#FEF3C7", label: "Play" },
  { key: "terrace", match: ["garden", "park", "green", "roof", "terrace", "outdoor"], tint: "#16A34A", soft: "#F0FDF4", label: "Outdoor" },
  { key: "spa", match: ["spa", "sauna", "wellness", "yoga"], tint: "#BE185D", soft: "#FDF2F8", label: "Wellness" },
  { key: "library", match: ["library", "study", "reading"], tint: "#4F46E5", soft: "#EEF2FF", label: "Study" },
  { key: "parking", match: ["parking", "garage", "car"], tint: "#475569", soft: "#F1F5F9", label: "Parking" },
  { key: "laundry", match: ["laundry", "wash"], tint: "#0D9488", soft: "#F0FDFA", label: "Laundry" },
  { key: "cinema", match: ["cinema", "theater", "theatre", "movie"], tint: "#7C3AED", soft: "#F5F3FF", label: "Cinema" },
  { key: "bike", match: ["bike", "cycle", "bicycle"], tint: "#2563EB", soft: "#EFF6FF", label: "Bike" },
];

const DEFAULT_VISUAL = {
  key: "building",
  tint: "#0052DF",
  soft: "#EFF6FF",
  label: "Building",
};

/** Fixed Lucide catalog for the admin icon picker. */
export const AMENITY_ICON_CATALOG = [
  ...VISUALS.map(({ key, tint, soft, label }) => ({ key, tint, soft, label })),
  DEFAULT_VISUAL,
];

export const AMENITY_ICON_KEYS = AMENITY_ICON_CATALOG.map((v) => v.key);

export function getAmenityVisual(name = "", iconKey = null) {
  if (iconKey) {
    const byKey = AMENITY_ICON_CATALOG.find((v) => v.key === iconKey);
    if (byKey) return byKey;
  }
  const n = String(name).toLowerCase();
  return VISUALS.find((v) => v.match.some((m) => n.includes(m))) ?? DEFAULT_VISUAL;
}

export function getAmenityStatus(status) {
  switch (status) {
    case "bookable":
      return {
        label: "Timed slots",
        color: "#B45309",
        bg: "#FEF3C7",
        dot: "#F59E0B",
        bookable: true,
        needsSlot: true,
      };
    case "closed":
      return {
        label: "Closed",
        color: "#B91C1C",
        bg: "#FEF2F2",
        dot: "#EF4444",
        bookable: false,
        needsSlot: false,
      };
    case "open":
    default:
      return {
        label: "Open availability",
        color: "#047857",
        bg: "#ECFDF5",
        dot: "#10B981",
        bookable: true,
        needsSlot: false,
      };
  }
}

export const SLOT_DURATION_OPTIONS = [
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
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

function formatMinutesLabel(total) {
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12}:00 ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Generate slots from start/end (HH:mm) and duration minutes. */
export function generateAmenitySlots(startTime, endTime, durationMinutes) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const duration = Number(durationMinutes);
  if (start == null || end == null || !duration || duration < 15 || end <= start) return [];

  const slots = [];
  for (let cursor = start; cursor + duration <= end; cursor += duration) {
    const from = formatMinutesLabel(cursor);
    const to = formatMinutesLabel(cursor + duration);
    slots.push({
      label: from,
      value: `${from} – ${to}`,
      start: `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`,
      end: `${String(Math.floor((cursor + duration) / 60)).padStart(2, "0")}:${String((cursor + duration) % 60).padStart(2, "0")}`,
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

  if (!name) errors.name = "Name is required.";
  else if (name.length < 2) errors.name = "Use at least 2 characters.";
  else if (name.length > 100) errors.name = "Keep the name under 100 characters.";

  if (description.length > 2000) errors.description = "Description is too long.";

  if (!["open", "bookable", "closed"].includes(status)) {
    errors.status = "Choose an availability option.";
  }

  if (capacityRaw === "") errors.capacity = "Capacity is required.";
  else {
    const capacity = Number(capacityRaw);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 1000) {
      errors.capacity = "Capacity must be 0–1000.";
    }
  }

  if (!floor) errors.floor = "Location is required.";
  else if (floor.length > 40) errors.floor = "Keep location under 40 characters.";

  if (!hours) errors.hours = "Open and close times are required.";
  else if (!parseHoursToApiTimes(hours)) errors.hours = "Use a valid open–close time range.";

  if (typeof weekends !== "boolean") {
    errors.weekends_available = "Choose weekend availability.";
  }

  if (status === "bookable") {
    if (![30, 60, 90, 120].includes(slotDuration)) {
      errors.slot_duration_minutes = "Choose a slot duration.";
    } else {
      const times = parseHoursToApiTimes(hours);
      if (times && generateAmenitySlots(times.start_time, times.end_time, slotDuration).length === 0) {
        errors.slot_duration_minutes = "Duration does not fit the open hours.";
      }
    }
  }

  if (!iconKey || !AMENITY_ICON_KEYS.includes(iconKey)) {
    errors.icon_key = "Category is required.";
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
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
      day: String(d.getDate()),
      month: d.toLocaleDateString("en-US", { month: "short" }),
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
    return date.toLocaleDateString("en-US", {
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
