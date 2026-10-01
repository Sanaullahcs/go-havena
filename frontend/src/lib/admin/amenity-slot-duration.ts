/** Timed-slot duration presets and custom range (matches API validation). */

export const AMENITY_SLOT_MIN_MINUTES = 15;
export const AMENITY_SLOT_MAX_MINUTES = 480;

export const PRESET_SLOT_DURATION_MINUTES = [30, 60, 90, 120] as const;

export const PRESET_SLOT_DURATION_OPTIONS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1.5 hours" },
  { minutes: 120, label: "2 hours" },
] as const;

export function isPresetSlotDurationMinutes(minutes: number): boolean {
  return PRESET_SLOT_DURATION_MINUTES.includes(minutes as (typeof PRESET_SLOT_DURATION_MINUTES)[number]);
}

export function splitSlotDurationMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function combineSlotDurationMinutes(hoursRaw: string | number, minutesRaw: string | number): number {
  const hours = Math.max(0, Math.floor(Number(hoursRaw) || 0));
  const minutes = Math.max(0, Math.min(59, Math.floor(Number(minutesRaw) || 0)));
  return hours * 60 + minutes;
}

export function isValidAmenitySlotDurationMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= AMENITY_SLOT_MIN_MINUTES && minutes <= AMENITY_SLOT_MAX_MINUTES;
}

export function formatSlotDurationLabel(minutes: number): string {
  const preset = PRESET_SLOT_DURATION_OPTIONS.find((opt) => opt.minutes === minutes);
  if (preset) return preset.label;
  const { hours, minutes: mins } = splitSlotDurationMinutes(minutes);
  if (hours && mins) return `${hours} hr ${mins} min`;
  if (hours) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${mins} min`;
}

const MINUTES_PER_DAY = 1440;

function timeToMinutes(hhmm: string): number | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** True when at least one slot fits in the open–close range. */
export function amenityHoursFitSlotDuration(open: string, close: string, durationMinutes: number): boolean {
  const start = timeToMinutes(open);
  let end = timeToMinutes(close);
  const duration = Number(durationMinutes);
  if (start == null || end == null || !duration || duration < AMENITY_SLOT_MIN_MINUTES) return false;
  if (end <= start) end += MINUTES_PER_DAY;
  return start + duration <= end;
}
