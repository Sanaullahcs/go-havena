type ScheduledEvent = {
  category?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  event_time_end?: string | null;
  schedule_timezone?: string | null;
};

function zoneParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function zoneOffsetMs(utcMs: number, timeZone: string) {
  const parts = zoneParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

function zonedWallTime(day: string, hour: number, minute: number, second: number, timeZone: string) {
  const [year, month, date] = day.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, date, hour, minute, second);
  const corrected = utcGuess - zoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess - zoneOffsetMs(corrected, timeZone));
}

/** True once the event's scheduled start is behind community-local now. */
export function isEventSchedulePast(notice: ScheduledEvent, now = new Date()) {
  if ((notice.category ?? "").toLowerCase() !== "event") return false;
  const day = String(notice.event_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;

  const timeZone = notice.schedule_timezone || "UTC";
  const clock = (notice.event_time || notice.event_time_end || "").trim();
  const match = clock.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    const today = zoneParts(now, timeZone);
    const todayKey = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
    return day < todayKey;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return false;
  return now.getTime() > zonedWallTime(day, hour, minute, 59, timeZone).getTime();
}
