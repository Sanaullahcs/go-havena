import { EMAIL_RE } from "@/lib/admin/form-validation-utils";
import {
  GUEST_PERMISSION_REQUIRED_MESSAGE,
  hasSelectedGuestPermission,
  type GuestPermissions,
} from "@/lib/guest-permissions";
import type { PhoneFieldState } from "@/lib/phone/format";

export const GUEST_NAME_RE = /^[\p{L} .]+$/u;

export const GUEST_NAME_FORMAT_MESSAGE =
  "Guest name can only contain letters, spaces, and full stops.";

export const GUEST_EMAIL_FORMAT_MESSAGE = "Please enter a valid email address.";

export const MIN_GUEST_ACCESS_MINUTES = 30;

export const GUEST_DURATION_MIN_MESSAGE = "Guest access duration must be at least 30 minutes.";

export const GUEST_START_PAST_MESSAGE = "Start date cannot be earlier than the current date and time.";

function startOfLocalMinute(value: Date): Date {
  const next = new Date(value);
  next.setSeconds(0, 0);
  return next;
}

export function guestStartFieldError(startsAt: string, now: Date = new Date()): string | null {
  if (!startsAt) return null;

  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;

  if (start.getTime() < startOfLocalMinute(now).getTime()) {
    return GUEST_START_PAST_MESSAGE;
  }

  return null;
}

export function guestDurationFieldError(startsAt: string, endsAt: string): string | null {
  if (!startsAt || !endsAt) return null;

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const durationMs = end.getTime() - start.getTime();
  if (durationMs < MIN_GUEST_ACCESS_MINUTES * 60 * 1000) {
    return GUEST_DURATION_MIN_MESSAGE;
  }

  return null;
}

export function guestNameFieldError(name: string): string | null {
  if (!name.trim()) return null;
  if (name.length > 100) return "Guest name must be 100 characters or less.";
  if (!GUEST_NAME_RE.test(name)) return GUEST_NAME_FORMAT_MESSAGE;
  return null;
}

export function guestEmailFieldError(email: string): string | null {
  const value = email.trim();
  if (!value) return null;
  if (value.length > 200) return "Email must be 200 characters or less.";
  if (!EMAIL_RE.test(value)) return GUEST_EMAIL_FORMAT_MESSAGE;
  return null;
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

  const start = new Date(form.starts_at);
  const end = new Date(form.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return false;
  }

  if (phone.digits && (!phone.valid || !phone.e164)) return false;

  return true;
}
