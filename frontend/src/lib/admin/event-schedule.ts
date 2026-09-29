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

function parseClockTime(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * True once the event has ended in the community timezone.
 * Uses event_date + event_time_end (not start time / date-only).
 * Same-day events without an end time stay editable until the local day ends.
 */
export function isEventSchedulePast(notice: ScheduledEvent, now = new Date()) {
  if ((notice.category ?? "").toLowerCase() !== "event") return false;
  const day = String(notice.event_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;

  const timeZone = notice.schedule_timezone || "UTC";
  const localNow = zoneParts(now, timeZone);
  const todayKey = `${localNow.year}-${String(localNow.month).padStart(2, "0")}-${String(localNow.day).padStart(2, "0")}`;

  if (day < todayKey) return true;
  if (day > todayKey) return false;

  const endClock = parseClockTime(String(notice.event_time_end ?? ""));
  if (!endClock) {
    // No end time on the same local day → still editable.
    return false;
  }

  return (
    localNow.hour > endClock.hour ||
    (localNow.hour === endClock.hour && localNow.minute > endClock.minute)
  );
}
