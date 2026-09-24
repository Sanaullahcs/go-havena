import { parseDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/admin/datetime-local";
import { EMAIL_RE } from "@/lib/admin/form-validation-utils";
import {
  GUEST_PERMISSION_REQUIRED_MESSAGE,
  hasSelectedGuestPermission,
  type GuestPermissions,
} from "@/lib/guest-permissions";
import type { PhoneFieldState } from "@/lib/phone/format";

export const GUEST_NAME_RE = /^[\p{L} .]+$/u;

export const GUEST_NAME_MIN = 2;

export const GUEST_NAME_MAX = 25;

export const GUEST_NAME_REQUIRED_MESSAGE = "Guest name is required.";

export const GUEST_NAME_MIN_MESSAGE = "Guest name must be at least 2 characters.";

export const GUEST_NAME_MAX_MESSAGE = "Guest name must be 25 characters or less.";

export const GUEST_NAME_FORMAT_MESSAGE =
  "Guest name can only contain letters, spaces, and full stops.";

export const GUEST_EMAIL_FORMAT_MESSAGE = "Please enter a valid email address.";

export const GUEST_EMAIL_EXISTS_MESSAGE = "An account with this email address already exists.";

export const MIN_GUEST_ACCESS_MINUTES = 30;

export const GUEST_DURATION_MIN_MESSAGE = "Guest access duration must be at least 30 minutes.";

export const MAX_GUEST_ACCESS_YEARS = 1;

export const GUEST_DURATION_MAX_MESSAGE =
  "Guest access cannot exceed 1 year from the start date.";

export const GUEST_START_PAST_MESSAGE = "Start date cannot be earlier than the current date and time.";

export function addCalendarYears(date: Date, years: number): Date {
  const next = new Date(date.getTime());
  const month = next.getMonth();
  next.setFullYear(next.getFullYear() + years);
  if (next.getMonth() !== month) {
    next.setDate(0);
  }
  return next;
}

export function guestAccessLatestEnd(start: Date): Date {
  return addCalendarYears(start, MAX_GUEST_ACCESS_YEARS);
}

export function guestAccessLatestEndLocalValue(startsAt: string): string {
  const start = parseDatetimeLocalValue(startsAt);
  if (!start) return "";
  return toDatetimeLocalValue(guestAccessLatestEnd(start));
}

export function guestAccessEarliestEndLocalValue(startsAt: string): string {
  const start = parseDatetimeLocalValue(startsAt);
  if (!start) return "";
  return toDatetimeLocalValue(new Date(start.getTime() + MIN_GUEST_ACCESS_MINUTES * 60 * 1000));
}

function startOfLocalMinute(value: Date): Date {
  const next = new Date(value);
  next.setSeconds(0, 0);
  return next;
}

export function guestStartFieldError(startsAt: string, now: Date = new Date()): string | null {
  if (!startsAt) return null;

  const start = parseDatetimeLocalValue(startsAt);
  if (!start) return null;

  if (start.getTime() < startOfLocalMinute(now).getTime()) {
    return GUEST_START_PAST_MESSAGE;
  }

  return null;
}

export function guestDurationFieldError(startsAt: string, endsAt: string): string | null {
  if (!startsAt || !endsAt) return null;

  const start = parseDatetimeLocalValue(startsAt);
  const end = parseDatetimeLocalValue(endsAt);
  if (!start || !end) return null;

  const durationMs = end.getTime() - start.getTime();
  if (durationMs < MIN_GUEST_ACCESS_MINUTES * 60 * 1000) {
    return GUEST_DURATION_MIN_MESSAGE;
  }

  if (end.getTime() > guestAccessLatestEnd(start).getTime()) {
    return GUEST_DURATION_MAX_MESSAGE;
  }

  return null;
}

export function guestNameFieldError(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return GUEST_NAME_REQUIRED_MESSAGE;
  if (trimmed.length < GUEST_NAME_MIN) return GUEST_NAME_MIN_MESSAGE;
  if (trimmed.length > GUEST_NAME_MAX) return GUEST_NAME_MAX_MESSAGE;
  if (!GUEST_NAME_RE.test(trimmed)) return GUEST_NAME_FORMAT_MESSAGE;
  return null;
}

export function guestEmailFieldError(email: string): string | null {
  const value = email.trim();
  if (!value) return null;
  if (value.length > 200) return "Email must be 200 characters or less.";
  if (!EMAIL_RE.test(value)) return GUEST_EMAIL_FORMAT_MESSAGE;
  return null;
}

export function isDuplicateGuestEmailError(
  fields: Record<string, string>,
  err?: unknown,
): boolean {
  const fieldMessage = fields.guest_email ?? "";
  if (/already exists/i.test(fieldMessage) && /email/i.test(fieldMessage)) {
    return true;
  }

  const data = (err as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
  const apiMessage = data?.message ?? "";
  if (data?.code === "CONTACT_ALREADY_EXISTS" && /email/i.test(`${fieldMessage} ${apiMessage}`)) {
    return true;
  }

  return /email already exists/i.test(apiMessage);
}

export function guestPermissionsFieldError(
  permissions?: GuestPermissions | Partial<GuestPermissions> | null,
): string | null {
  if (!hasSelectedGuestPermission(permissions)) {
    return GUEST_PERMISSION_REQUIRED_MESSAGE;
  }
  return null;
}

export function canSubmitGuestInvite(
  form: {
    guest_name: string;
    guest_email: string;
    starts_at: string;
    ends_at: string;
    permissions?: GuestPermissions | Partial<GuestPermissions> | null;
  },
  phone: PhoneFieldState,
  now: Date = new Date(),
): boolean {
  if (!form.guest_name.trim() || guestNameFieldError(form.guest_name)) return false;
  if (!form.guest_email.trim() || guestEmailFieldError(form.guest_email)) return false;
  if (guestPermissionsFieldError(form.permissions)) return false;
  if (!form.starts_at || !form.ends_at) return false;
  if (guestStartFieldError(form.starts_at, now)) return false;
  if (guestDurationFieldError(form.starts_at, form.ends_at)) return false;

  const start = parseDatetimeLocalValue(form.starts_at);
  const end = parseDatetimeLocalValue(form.ends_at);
  if (!start || !end || end <= start) {
    return false;
  }

  if (phone.digits && (!phone.valid || !phone.e164)) return false;

  return true;
}

/** Bump start/end forward when the picked start minute has passed (datetime-local has no seconds). */
export function normalizeGuestInviteWindow(
  startsAt: string,
  endsAt: string,
  now: Date = new Date(),
): { starts_at: string; ends_at: string } {
  const start = parseDatetimeLocalValue(startsAt);
  const end = parseDatetimeLocalValue(endsAt);
  if (!start || !end) {
    return { starts_at: startsAt, ends_at: endsAt };
  }

  const earliest = startOfLocalMinute(now);
  if (start.getTime() >= earliest.getTime()) {
    return { starts_at: startsAt, ends_at: endsAt };
  }

  const durationMs = Math.max(end.getTime() - start.getTime(), MIN_GUEST_ACCESS_MINUTES * 60 * 1000);
  const nextStart = earliest;
  const nextEnd = new Date(nextStart.getTime() + durationMs);
  return {
    starts_at: toDatetimeLocalValue(nextStart),
    ends_at: toDatetimeLocalValue(nextEnd),
  };
}
