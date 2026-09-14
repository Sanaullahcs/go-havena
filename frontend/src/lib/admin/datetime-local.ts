/** Format a Date as `<input type="datetime-local">` value in the browser timezone. */
export function toDatetimeLocalValue(date: Date = new Date()): string {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

/** Convert API ISO datetime to `<input type="datetime-local">` value in the browser timezone. */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return toDatetimeLocalValue(date);
}

/** Convert `<input type="datetime-local">` value to ISO UTC for the API. */
export function datetimeLocalToIso(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Human-readable local datetime for admin tables (matches what admins pick in the form). */
export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
