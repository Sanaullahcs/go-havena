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

export function validateInviteMemberForm(form: InviteMemberForm): FieldErrors {
  const errors: FieldErrors = {};

  const nameError = validateRequiredName(form.name, "Full name");
  if (nameError) errors.name = nameError;

  const emailError = validateEmailField(form.email);
  if (emailError) errors.email = emailError;

  const unit = form.unit.trim();
  if (unit.length > 50) {
    errors.unit = "Unit must be 50 characters or less.";
  }

  return errors;
}

export type SystemMemberInviteForm = InviteMemberForm & {
  communityId: string;
};

export function validateSystemMemberInviteForm(form: SystemMemberInviteForm): FieldErrors {
  const errors = validateInviteMemberForm(form);

  if (!form.communityId) {
    errors.communityId = "Select a community.";
  }

  return errors;
}
