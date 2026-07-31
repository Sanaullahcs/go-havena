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

export function formatTimeDisplay(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${m} ${suffix}`;
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

export function buildSchedulePreview(
  date: string,
  timeFrom: string,
  timeTo: string,
): SchedulePreview | null {
  if (!date && !timeFrom && !timeTo) return null;

  const dateLabel = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const timeParts: string[] = [];
  if (timeFrom) timeParts.push(formatTimeDisplay(timeFrom));
  if (timeTo) timeParts.push(formatTimeDisplay(timeTo));

  let timeRange: string | null = null;
  if (timeParts.length === 2) {
    timeRange = `${timeParts[0]} – ${timeParts[1]}`;
  } else if (timeParts.length === 1) {
    timeRange = timeParts[0] ?? null;
  }

  const overnight = Boolean(timeFrom && timeTo && isOvernightSchedule(timeFrom, timeTo));
  const durationMinutes =
    timeFrom && timeTo ? scheduleDurationMinutes(timeFrom, timeTo) : null;
  const duration =
    durationMinutes != null && durationMinutes > 0
      ? formatDurationLabel(durationMinutes)
      : null;

  let headline: string | null = null;
  if (dateLabel && timeRange) headline = `${dateLabel} · ${timeRange}`;
  else headline = dateLabel ?? timeRange;

  return { headline, timeRange, duration, overnight };
}

/** Convert local publish date/time pickers to ISO UTC for the API. */
export function toScheduleApiDateTime(date: string, time: string): string | undefined {
  if (!date.trim() || !time.trim()) return undefined;
  const local = new Date(`${date.trim()}T${time.trim()}:00`);
  if (Number.isNaN(local.getTime())) return undefined;
  return local.toISOString();
}
