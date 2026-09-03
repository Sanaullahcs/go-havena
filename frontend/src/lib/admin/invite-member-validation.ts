import { getPhoneValidationError, type PhoneFieldState } from "@/lib/phone/format";
import {
  type FieldErrors,
  validateEmailField,
  validateRequiredName,
} from "@/lib/admin/form-validation-utils";

export type InviteMemberForm = {
  name: string;
  email: string;
  unit: string;
};

export function validateInviteMemberForm(
  form: InviteMemberForm,
  phone: PhoneFieldState,
): FieldErrors {
  const errors: FieldErrors = {};

  const nameError = validateRequiredName(form.name, "Full name");
  if (nameError) errors.name = nameError;

  const emailError = validateEmailField(form.email);
  if (emailError) errors.email = emailError;

  if (!phone.digits.trim()) {
    errors.phone = "Phone number is required.";
  } else if (!phone.valid) {
    errors.phone = getPhoneValidationError(phone.digits, phone.country) ?? "Enter a valid phone number.";
  }

  const unit = form.unit.trim();
  if (unit.length > 50) {
    errors.unit = "Unit must be 50 characters or less.";
  }

  return errors;
}

export type SystemMemberInviteForm = InviteMemberForm & {
  communityId: string;
};

export function validateSystemMemberInviteForm(
  form: SystemMemberInviteForm,
  phone: PhoneFieldState,
): FieldErrors {
  const errors = validateInviteMemberForm(form, phone);

  if (!form.communityId) {
    errors.communityId = "Select a community.";
  }

  return errors;
}
