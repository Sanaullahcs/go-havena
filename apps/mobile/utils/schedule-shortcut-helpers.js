/** Shared quick-pick helpers for event/notice schedule forms. */
export function buildQuickDate(daysFromToday) {
  const next = new Date();
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + daysFromToday);
  return next;
}

export function buildQuickStartInHours(hoursFromNow) {
  const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  start.setSeconds(0, 0);
  return start;
}
