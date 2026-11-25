import {
  COMMUNITY_ADMIN_NAME_MAX,
  COMMUNITY_ADMIN_NAME_MAX_MESSAGE,
  exceedsCharacterLimit,
} from "@/lib/admin/community-admin-field-limits";
import { getPhoneValidationError, type PhoneFieldState } from "@/lib/phone/format";
import {
  type FieldErrors,
  validateRequiredName,
} from "@/lib/admin/form-validation-utils";

export function validateProfileForm(
  name: string,
  phone: PhoneFieldState,
  bio: string,
  options?: { communityAdmin?: boolean },
): FieldErrors {
  const errors: FieldErrors = {};

  if (options?.communityAdmin) {
    const value = name.trim();
    if (!value) errors.name = "Full name is required.";
    else if (value.length < 2) errors.name = "Full name must be at least 2 characters.";
    else if (exceedsCharacterLimit(name, COMMUNITY_ADMIN_NAME_MAX)) {
      errors.name = COMMUNITY_ADMIN_NAME_MAX_MESSAGE;
    }
  } else {
    const nameError = validateRequiredName(name, "Full name");
    if (nameError) errors.name = nameError;
  }

  if (phone.digits.trim() && !phone.valid) {
    errors.phone = getPhoneValidationError(phone.digits, phone.country) ?? "Enter a valid phone number.";
  }

  if (bio.trim().length > 500) {
    errors.bio = "Bio must be 500 characters or less.";
  }

  return errors;
}

export function validatePasswordForm(
  current: string,
  next: string,
  confirm: string,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!current.trim()) {
    errors.current = "Current password is required.";
  }

  if (!next.trim()) {
    errors.next = "New password is required.";
  } else if (next.length < 8) {
    errors.next = "Password must be at least 8 characters.";
  } else if (next.length > 128) {
    errors.next = "Password must be 128 characters or less.";
  }

  if (!confirm.trim()) {
    errors.confirm = "Please confirm your new password.";
  } else if (next !== confirm) {
    errors.confirm = "Passwords do not match.";
  }

  return errors;
}
