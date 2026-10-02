import { resolveEffectiveEndDate } from "@/lib/admin/notice-schedule-utils";

type ScheduledEvent = {
  category?: string | null;
  event_date?: string | null;
  event_end_date?: string | null;
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
 * Uses effective end date (event_end_date or event_date) + event_time_end,
 * aligned with backend NoticeExpiry.
 */
export function isEventSchedulePast(notice: ScheduledEvent, now = new Date()) {
  if ((notice.category ?? "").toLowerCase() !== "event") return false;

  const startDay = String(notice.event_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) return false;

  const endDay = resolveEffectiveEndDate(
    startDay,
    String(notice.event_end_date ?? "").slice(0, 10),
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDay)) return false;

  const timeZone = notice.schedule_timezone || "UTC";
  const localNow = zoneParts(now, timeZone);
  const todayKey = `${localNow.year}-${String(localNow.month).padStart(2, "0")}-${String(localNow.day).padStart(2, "0")}`;

  if (endDay < todayKey) return true;
  if (endDay > todayKey) return false;

  const endClock = parseClockTime(String(notice.event_time_end ?? ""));
  if (!endClock) {
    return false;
  }

  return (
    localNow.hour > endClock.hour ||
    (localNow.hour === endClock.hour && localNow.minute > endClock.minute)
  );
}
