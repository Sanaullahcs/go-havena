import { getPhoneValidationError, type PhoneFieldState } from "@/lib/phone/format";
import { type FieldErrors, validateEmailField } from "@/lib/admin/form-validation-utils";

export type InviteMemberForm = {
  name: string;
  email: string;
  unit: string;
  /** Extra units beyond the first (optional). Prefer `units` when inviting multi-unit. */
  units?: string[];
};

export const INVITE_MEMBER_NAME_RE = /^[\p{L} .]+$/u;
/** Letters, numbers, spaces, hyphen, and slash only. */
export const INVITE_MEMBER_UNIT_RE = new RegExp("^[A-Za-z0-9 /\\-]{1,20}$");

export const INVITE_MEMBER_NAME_RULE_MESSAGE =
  "Full Name can only contain letters, spaces, and full stops, with a maximum of 25 characters.";

export const INVITE_MEMBER_UNIT_RULE_MESSAGE = "Please enter a valid Unit / Apartment number.";

function unitHasOnlyAllowedChars(unit: string): boolean {
  for (const ch of unit) {
    const allowed =
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === " " ||
      ch === "-" ||
      ch === "/";
    if (!allowed) return false;
  }
  return true;
}

export function inviteMemberNameFieldError(name: string): string | null {
  if (!name.trim()) return "Full name is required.";
  if (name.length > 25 || !INVITE_MEMBER_NAME_RE.test(name)) {
    return INVITE_MEMBER_NAME_RULE_MESSAGE;
  }
  return null;
}

export function inviteMemberUnitFieldError(unit: string): string | null {
  if (!unit.trim()) return "Unit / Apartment is required.";
  if (unit.length > 20 || !unitHasOnlyAllowedChars(unit) || !INVITE_MEMBER_UNIT_RE.test(unit)) {
    return INVITE_MEMBER_UNIT_RULE_MESSAGE;
  }
  return null;
}

/** Format/length only — empty values stay silent until submit/touch. */
export function inviteMemberNameLiveError(name: string): string | null {
  if (!name.trim()) return null;
  return inviteMemberNameFieldError(name);
}

export function inviteMemberUnitLiveError(unit: string): string | null {
  if (!unit.trim()) return null;
  return inviteMemberUnitFieldError(unit);
}

export function collectInviteUnitNumbers(form: InviteMemberForm): string[] {
  const fromList = (form.units ?? []).map((u) => u.trim()).filter(Boolean);
  if (fromList.length > 0) return fromList;
  const single = form.unit.trim();
  return single ? [single] : [];
}

export function inviteMemberUnitsFieldError(units: string[]): string | null {
  if (units.length === 0) return "At least one unit is required.";
  const seen = new Set<string>();
  for (const unit of units) {
    const err = inviteMemberUnitFieldError(unit);
    if (err) return err;
    const key = unit.trim().toLowerCase();
    if (seen.has(key)) return "Each unit can only be added once.";
    seen.add(key);
  }
  return null;
}

export function validateInviteMemberForm(
  form: InviteMemberForm,
  phone: PhoneFieldState,
  options?: { requireUnits?: boolean },
): FieldErrors {
  const errors: FieldErrors = {};

  const nameError = inviteMemberNameFieldError(form.name);
  if (nameError) errors.name = nameError;

  const emailError = validateEmailField(form.email);
  if (emailError) errors.email = emailError;

  if (!phone.digits.trim()) {
    errors.phone = "Phone number is required.";
  } else if (!phone.valid) {
    errors.phone = getPhoneValidationError(phone.digits, phone.country) ?? "Enter a valid phone number.";
  }

  if (options?.requireUnits !== false) {
    const unitNumbers = collectInviteUnitNumbers(form);
    const unitsError = inviteMemberUnitsFieldError(unitNumbers);
    if (unitsError) errors.unit = unitsError;
  }

  return errors;
}

export type SystemMemberInviteForm = InviteMemberForm & {
  communityId: string;
};

export function validateSystemMemberInviteForm(
  form: SystemMemberInviteForm,
  phone: PhoneFieldState,
  options?: { requireUnits?: boolean },
): FieldErrors {
  const errors = validateInviteMemberForm(form, phone, options);

  if (!form.communityId) {
    errors.communityId = "Select a community.";
  }

  return errors;
}
