import i18n from "../i18n";
import { getLocaleForLang } from "../hooks/use-app-locale";

function getDisplayLocale() {
  return getLocaleForLang(i18n.language);
}

function toValidDate(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Month Day, Year — e.g. Jul 27, 2026 */
export function formatDisplayDate(date) {
  const d = toValidDate(date);
  if (!d) return "";
  return d.toLocaleDateString(getDisplayLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** 12-hour time — e.g. 4:30 PM */
export function formatDisplayTime(date) {
  const d = toValidDate(date);
  if (!d) return "";
  return d.toLocaleTimeString(getDisplayLocale(), {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** e.g. Mon, Jul 27 — used in access window timelines. */
export function formatAccessDay(date) {
  const d = toValidDate(date);
  if (!d) return "—";
  return d.toLocaleDateString(getDisplayLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** e.g. Jul 27, 2026, 4:30 PM */
export function formatDisplayDateTime(date) {
  const d = toValidDate(date);
  if (!d) return "—";
  return d.toLocaleString(getDisplayLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Calendar date at local midnight — for date pickers paired with a separate time value. */
export function dateOnly(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Combine date + time pickers into one local Date. */
export function mergeDateAndTime(datePart, timePart) {
  if (!datePart || !timePart) return null;
  const merged = new Date(datePart);
  merged.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return merged;
}

/** Round up to the next whole hour when minutes are set. */
export function roundToNextHour(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return new Date();
  d.setSeconds(0, 0);
  if (d.getMinutes() === 0) return d;
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

export function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/** Build paired date/time picker values for a duration starting at `start`. */
export function buildAccessWindowFromDuration(start, hours) {
  const safeStart = start instanceof Date && !Number.isNaN(start.getTime()) ? start : roundToNextHour(new Date());
  const end = addHours(safeStart, hours);
  return {
    startDate: dateOnly(safeStart),
    startTime: new Date(safeStart),
    endDate: dateOnly(end),
    endTime: new Date(end),
  };
}

export function toApiDate(date) {
  if (!date) return undefined;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toApiTime(date) {
  if (!date) return undefined;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Combine date + time pickers into API datetime (YYYY-MM-DDTHH:mm:ss). */
export function toApiDateTime(date, time) {
  const d = toApiDate(date);
  const t = toApiTime(time);
  if (!d || !t) return undefined;
  return `${d}T${t}:00`;
}

/** Schedule publish datetime as ISO UTC for the API. */
export function toApiScheduleDateTime(date, time) {
  const d = toApiDate(date);
  const t = toApiTime(time);
  if (!d || !t) return undefined;
  const local = new Date(`${d}T${t}:00`);
  if (Number.isNaN(local.getTime())) return undefined;
  return local.toISOString();
}
