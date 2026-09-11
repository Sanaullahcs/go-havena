import { EMAIL_RE } from "@/lib/admin/form-validation-utils";
import type { PhoneFieldState } from "@/lib/phone/format";

export const GUEST_NAME_RE = /^[\p{L} .]+$/u;

export const GUEST_NAME_FORMAT_MESSAGE =
  "Guest name can only contain letters, spaces, and full stops.";

export const GUEST_EMAIL_FORMAT_MESSAGE = "Please enter a valid email address.";

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

export function canSubmitGuestInvite(
  form: { guest_name: string; guest_email: string; starts_at: string; ends_at: string },
  phone: PhoneFieldState,
): boolean {
  if (!form.guest_name.trim() || guestNameFieldError(form.guest_name)) return false;
  if (!form.guest_email.trim() || guestEmailFieldError(form.guest_email)) return false;
  if (!form.starts_at || !form.ends_at) return false;

  const start = new Date(form.starts_at);
  const end = new Date(form.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return false;
  }

  if (phone.digits && (!phone.valid || !phone.e164)) return false;

  return true;
}
