export const POLL_HOUR_PRESETS = [1, 3, 6, 12, 24];
export const POLL_DAY_PRESETS = [1, 3, 7, 14, 30];
export const POLL_MAX_HOURS = 720;
export const POLL_MAX_DAYS = 30;

export const DEFAULT_POLL_DURATION = { unit: "hours", kind: "preset", value: 24 };

export function clampPollCustomValue(unit, raw) {
  const n = Math.floor(Number(raw) || 0);
  if (unit === "hours") {
    return Math.min(POLL_MAX_HOURS, Math.max(1, n));
  }
  return Math.min(POLL_MAX_DAYS, Math.max(1, n));
}

export function toPollDurationApiPayload(selection) {
  if (selection.unit === "hours") {
    return { duration_hours: selection.value };
  }
  return { duration_days: selection.value };
}

export function presetsForUnit(unit) {
  return unit === "hours" ? POLL_HOUR_PRESETS : POLL_DAY_PRESETS;
}
