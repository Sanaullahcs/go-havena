export function parseTimeMinutes(time: string): number | null {
  const trimmed = time.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

/** Normalize a stored or typed time to `HH:MM` (24-hour). Accepts `14:20`, `2:20 PM`, or `2 PM`. */
export function parseFlexibleTime(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const h24 = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (h24) {
    const h = Number(h24[1]);
    const m = Number(h24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return null;
  }

  const mer = trimmed.match(/^(\d{1,2})(?::(\d{1,2}))?\s*([AaPp][Mm])$/);
  if (mer) {
    let h = Number(mer[1]);
    const m = mer[2] != null ? Number(mer[2]) : 0;
    const period = mer[3].toUpperCase();
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (period === "AM") {
      if (h === 12) h = 0;
    } else if (h !== 12) {
      h += 12;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return null;
}

export function formatTimeDisplay(time: string): string {
  if (!time) return "";
  const normalized = parseFlexibleTime(time) ?? time;
  const [h, m] = normalized.split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function addMinutesToTime(time: string, minutes: number): string {
  const startMin = parseTimeMinutes(time);
  if (startMin == null) return "";
  const total = (startMin + minutes) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isOvernightSchedule(timeFrom: string, timeTo: string): boolean {
  const startMin = parseTimeMinutes(timeFrom);
  const endMin = parseTimeMinutes(timeTo);
  if (startMin == null || endMin == null) return false;
  return endMin < startMin;
}

export function scheduleDurationMinutes(timeFrom: string, timeTo: string): number | null {
  const startMin = parseTimeMinutes(timeFrom);
  const endMin = parseTimeMinutes(timeTo);
  if (startMin == null || endMin == null) return null;
  if (endMin === startMin) return 0;
  if (endMin > startMin) return endMin - startMin;
  return 24 * 60 - startMin + endMin;
}

export function formatDurationLabel(minutes: number): string {
  if (minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

export type SchedulePreview = {
  headline: string | null;
  timeRange: string | null;
  duration: string | null;
  overnight: boolean;
};

export function resolveEffectiveEndDate(startDate: string, endDate: string): string {
  const start = startDate.trim().slice(0, 10);
  const end = endDate.trim().slice(0, 10);
  return end || start;
}

export function isScheduleEndBeforeStart(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): boolean {
  const startDay = startDate.trim().slice(0, 10);
  const endDay = resolveEffectiveEndDate(startDate, endDate);
  if (!startDay || !endDay) return false;
  if (endDay < startDay) return true;
  if (endDay > startDay) return false;
  const startMin = parseTimeMinutes(startTime);
  const endMin = parseTimeMinutes(endTime);
  if (startMin == null || endMin == null) return false;
  return endMin <= startMin;
}

export function buildSchedulePreview(
  startDate: string,
  timeFrom: string,
  timeTo: string,
  endDate = "",
): SchedulePreview | null {
  if (!startDate && !endDate && !timeFrom && !timeTo) return null;

  const formatDay = (date: string) =>
    date
      ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

  const startLabel = formatDay(startDate);
  const effectiveEnd = resolveEffectiveEndDate(startDate, endDate);
  const endLabel = effectiveEnd && effectiveEnd !== startDate.trim().slice(0, 10) ? formatDay(effectiveEnd) : null;

  const timeParts: string[] = [];
  if (timeFrom) timeParts.push(formatTimeDisplay(timeFrom));
  if (timeTo) timeParts.push(formatTimeDisplay(timeTo));

  let timeRange: string | null = null;
  if (timeParts.length === 2) {
    timeRange = `${timeParts[0]} – ${timeParts[1]}`;
  } else if (timeParts.length === 1) {
    timeRange = timeParts[0] ?? null;
  }

  const overnight = Boolean(
    timeFrom &&
      timeTo &&
      (isOvernightSchedule(timeFrom, timeTo) ||
        (endLabel && effectiveEnd > startDate.trim().slice(0, 10))),
  );
  const durationMinutes =
    timeFrom && timeTo ? scheduleDurationMinutes(timeFrom, timeTo) : null;
  const duration =
    durationMinutes != null && durationMinutes > 0 && !endLabel
      ? formatDurationLabel(durationMinutes)
      : null;

  let dateLabel: string | null = null;
  if (startLabel && endLabel) dateLabel = `${startLabel} – ${endLabel}`;
  else dateLabel = startLabel ?? endLabel;

  let headline: string | null = null;
  if (dateLabel && timeRange) headline = `${dateLabel} · ${timeRange}`;
  else headline = dateLabel ?? timeRange;

  return { headline, timeRange, duration, overnight };
}

/**
 * Parse API scheduled_at into local date/time strings for form pickers.
 * Handles ISO-8601, MySQL "YYYY-MM-DD HH:mm:ss", and UTC offsets.
 */
export function parseScheduledAtForForm(scheduledAt?: string | null): { date: string; time: string } {
  if (!scheduledAt) return { date: "", time: "" };

  const str = String(scheduledAt).trim();
  if (!str) return { date: "", time: "" };

  let date: Date | null = null;

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(str)) {
    const withZone = new Date(str);
    if (!Number.isNaN(withZone.getTime())) date = withZone;
  }

  if (!date) {
    const mysqlMatch = str.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/,
    );
    if (mysqlMatch) {
      const [, y, mo, d, h, mi, s = "0"] = mysqlMatch;
      date = new Date(
        Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
      );
    }
  }

  if (!date) {
    const iso = str.includes("T") ? str : str.replace(" ", "T");
    const parsed = new Date(
      iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`,
    );
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }

  if (!date) return { date: "", time: "" };

  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

/** Convert local publish date/time pickers to ISO UTC for the API. */
export function toScheduleApiDateTime(date: string, time: string): string | undefined {
  if (!date.trim() || !time.trim()) return undefined;
  const local = new Date(`${date.trim()}T${time.trim()}:00`);
  if (Number.isNaN(local.getTime())) return undefined;
  return local.toISOString();
}

export const NOTICE_FUTURE_TIME_MESSAGE = "Please select a future date and time.";

/** Calendar date + minute-of-day in a timezone (defaults to the browser local zone). */
export function zonedNowParts(now: Date = new Date(), timeZone?: string): { date: string; minutes: number } {
  if (!timeZone) {
    return {
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return {
    date: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

/** Minimum selectable HH:MM when `date` is today; otherwise null (all times allowed). */
export function minTimeForNoticeDate(
  date: string,
  now: Date = new Date(),
  timeZone?: string,
): string | null {
  const trimmed = date.trim();
  if (!trimmed) return null;
  const { date: today, minutes } = zonedNowParts(now, timeZone);
  if (trimmed !== today) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** True when the calendar date is before today in the active timezone. */
export function isNoticeDateInPast(
  date: string,
  now: Date = new Date(),
  timeZone?: string,
): boolean {
  const trimmed = date.trim().slice(0, 10);
  if (!trimmed) return false;
  return trimmed < zonedNowParts(now, timeZone).date;
}

/** True when date is today and time is strictly before the current minute. */
export function isNoticeTimeInPast(
  date: string,
  time: string,
  now: Date = new Date(),
  timeZone?: string,
): boolean {
  const minTime = minTimeForNoticeDate(date, now, timeZone);
  if (!minTime) return false;
  const selected = parseTimeMinutes(parseFlexibleTime(time) ?? time);
  const minimum = parseTimeMinutes(minTime);
  if (selected == null || minimum == null) return false;
  return selected < minimum;
}
