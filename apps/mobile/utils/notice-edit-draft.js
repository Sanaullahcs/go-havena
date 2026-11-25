import { parseApiDate } from "./parse-api-date.js";

/** Calendar day from an API date, anchored at local noon so the day does not shift. */
export function dateFromApiDay(value) {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12, 0, 0, 0);
}

/** Wall-clock time from HH:mm or HH:mm:ss. The date portion is today and is not sent. */
export function timeFromApiClock(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** Local date and time pickers for a UTC schedule instant. */
export function schedulePartsFromIso(value) {
  const parsed = parseApiDate(value);
  if (!parsed) return { date: null, time: null };
  const date = new Date(parsed);
  date.setHours(12, 0, 0, 0);
  const time = new Date(parsed);
  return { date, time };
}

export function noticeEditFormState(notice) {
  const scheduled =
    notice?.status === "draft" && notice?.scheduledAt
      ? schedulePartsFromIso(notice.scheduledAt)
      : { date: null, time: null };

  return {
    title: notice?.title ?? "",
    description: notice?.body ?? "",
    category: notice?.category || "general",
    location: notice?.location ?? "",
    noticeDate: dateFromApiDay(notice?.eventDate),
    endNoticeDate: dateFromApiDay(notice?.eventEndDate || notice?.eventDate),
    startTime: timeFromApiClock(notice?.eventTime),
    endTime: timeFromApiClock(notice?.eventTimeEnd),
    pinToTop: Boolean(notice?.isPinnedSetting),
    scheduleLater: Boolean(scheduled.date && scheduled.time),
    schedulePublishDate: scheduled.date,
    schedulePublishTime: scheduled.time,
    audienceType: notice?.audienceType === "selected" ? "selected" : "all",
    selectedResidentIds: (notice?.recipientUserIds ?? [])
      .map((id) => Number(id))
      .filter((id) => id > 0),
    coverImage: notice?.imageUrl ? { uri: notice.imageUrl, remote: true } : null,
    keptImageUrl: notice?.imageUrl || null,
    originalStatus: notice?.status || "published",
  };
}
