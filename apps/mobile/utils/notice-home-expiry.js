function noticeDayKey(dateStr) {
  if (!dateStr) return null;
  const key = String(dateStr).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
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

/** True when a notice should be hidden from home sections after its schedule window ends. */
export function isNoticeExpiredForHome(notice, now = new Date()) {
  const category = String(notice?.category ?? "").trim().toLowerCase();
  const isEvent = category === "event" || notice?.isEvent === true;
  const dayKey = noticeDayKey(notice?.eventDate ?? notice?.event_date);
  if (!dayKey) {
    return category !== "emergency" && !isAlertNotice(notice);
  }

  const todayKey = todayDayKey(now);
  if (dayKey < todayKey) return true;
  if (dayKey > todayKey) return false;

  // Events stay on Happening Soon for the full calendar day.
  if (isEvent) return false;

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

export function isCarouselNotice(notice) {
  return notice && !isEventNotice(notice) && !isAlertNotice(notice);
}
