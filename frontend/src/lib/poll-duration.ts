export const POLL_HOUR_PRESETS = [1, 3, 6, 12, 24] as const;

export const POLL_DAY_PRESETS = [1, 3, 7, 14, 30] as const;

export const POLL_MAX_HOURS = 720;
export const POLL_MAX_DAYS = 30;

export type PollDurationUnit = "hours" | "days";

export type PollDurationSelection =
  | { unit: PollDurationUnit; kind: "preset"; value: number }
  | { unit: PollDurationUnit; kind: "custom"; value: number };

export const DEFAULT_POLL_DURATION: PollDurationSelection = {
  unit: "hours",
  kind: "preset",
  value: 24,
};

export function pollDurationLabel(unit: PollDurationUnit, value: number): string {
  if (unit === "hours") {
    return value === 1 ? "1 hour" : `${value} hours`;
  }
  return value === 1 ? "1 day" : `${value} days`;
}

export function toPollDurationApiPayload(selection: PollDurationSelection): {
  duration_hours?: number;
  duration_days?: number;
} {
  if (selection.unit === "hours") {
    return { duration_hours: selection.value };
  }
  return { duration_days: selection.value };
}

export function clampPollCustomValue(unit: PollDurationUnit, raw: number): number {
  const n = Math.floor(Number(raw) || 0);
  if (unit === "hours") {
    return Math.min(POLL_MAX_HOURS, Math.max(1, n));
  }
  return Math.min(POLL_MAX_DAYS, Math.max(1, n));
}
