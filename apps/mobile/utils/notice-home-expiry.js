function noticeDayKey(dateStr) {
  if (!dateStr) return null;
  const key = String(dateStr).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function effectiveEndDayKey(notice) {
  const start = noticeDayKey(notice?.eventDate ?? notice?.event_date);
  if (!start) return null;
  const end = noticeDayKey(notice?.eventEndDate ?? notice?.event_end_date);
  return end ?? start;
}

function todayDayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseClockTime(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().split(":");
  const hour = Number(parts[0]);
  const minute = Number(String(parts[1] ?? "0").slice(0, 2));
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * True when a notice should leave Home after its schedule window ends.
 * A notice with no start date is an ongoing announcement and stays visible,
 * matching the notices list on the server.
 */
export function isNoticeExpiredForHome(notice, now = new Date()) {
  const dayKey = noticeDayKey(notice?.eventDate ?? notice?.event_date);
  if (!dayKey) return false;

  const endDayKey = effectiveEndDayKey(notice);
  const todayKey = todayDayKey(now);
  if (endDayKey < todayKey) return true;
  if (endDayKey > todayKey) return false;

  const endTime = notice.eventTimeEnd ?? notice.event_time_end;
  const clock = parseClockTime(endTime);
  if (clock) {
    const end = new Date(now);
    end.setHours(clock.hour, clock.minute, 0, 0);
    return now > end;
  }

  return false;
}

export function isEventNotice(notice) {
  const category = String(notice?.category ?? "").trim().toLowerCase();
  return category === "event" || notice?.isEvent === true;
}

export function isAlertNotice(notice) {
  const category = String(notice?.category ?? "").trim().toLowerCase();
  return category === "emergency" || notice?.isAlert === true;
}

export function isFinanceNotice(notice) {
  const category = String(notice?.category ?? "").trim().toLowerCase();
  return category === "finance";
}

export function isCarouselNotice(notice) {
  // Home hero shows announcements + alerts; events go to Happening Soon.
  return Boolean(notice) && !isEventNotice(notice);
}
