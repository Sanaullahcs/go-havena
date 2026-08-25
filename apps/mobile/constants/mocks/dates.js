/** Relative timestamps so mock events/notices stay fresh. */

export function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysFromNowIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function hoursAgo(hours) {
  const d = new Date(Date.now() - hours * 3600000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function daysFromNowDatetime(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19).replace("T", " ");
}
