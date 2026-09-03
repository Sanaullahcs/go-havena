/**
 * Complete profile validation — aligned with apps/mobile/utils/form-validation.js
 * and backend ProfileController rules.
 */

import { EMAIL_RE, type FieldErrors } from "@/lib/admin/form-validation-utils";

export const COMPLETE_PROFILE_LIMITS = {
  profileName: 50,
  profileUnit: 50,
  profileEmail: 255,
  profileBio: 500,
  utilityBillMaxBytes: 10 * 1024 * 1024,
} as const;

export const PLACEHOLDER_EMAIL_SUFFIX = "@phone.havena.local";

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  const value = String(email ?? "").trim().toLowerCase();
  return !value || value.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

export function isPlaceholderDisplayName(name: string | null | undefined): boolean {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || trimmed === "My Profile" || trimmed === "Neighbor") return true;
  if (trimmed.toLowerCase().includes(PLACEHOLDER_EMAIL_SUFFIX)) return true;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) {
    const compact = trimmed.replace(/[\s().+-]/g, "");
    if (compact === digits || compact === `+${digits}`) return true;
  }
  return false;
}

export type UtilityFileInput =
  | { kind: "file"; file: File }
  | { kind: "existing"; url: string }
  | null;

function requiredText(
  value: string,
  label: string,
  { min, max }: { min?: number; max?: number } = {},
): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return `${label} is required.`;
  if (min != null && trimmed.length < min) {
    return `${label} must be at least ${min} characters.`;
  }
  if (max != null && trimmed.length > max) {
    return `${label} must be ${max} characters or less.`;
  }
  return null;
}

export function validateUserEmail(email: string): string | null {
  const value = String(email ?? "").trim();
  if (!value) return "Email address is required.";
  if (value.length > COMPLETE_PROFILE_LIMITS.profileEmail) {
    return `Email must be ${COMPLETE_PROFILE_LIMITS.profileEmail} characters or less.`;
  }
  if (!EMAIL_RE.test(value)) return "Enter a valid email address.";
  if (isPlaceholderEmail(value)) return "Enter a personal email address.";
  return null;
}

export function validateCompleteProfileForm(input: {
  name: string;
  email: string;
  bio: string;
  unitNumber: string;
  residenceType: string;
  utilityFile: UtilityFileInput;
  requireUtilityFile?: boolean;
  requireResidenceType?: boolean;
  guestMode?: boolean;
}): FieldErrors {
  const errors: FieldErrors = {};
  const {
    name,
    email,
    bio,
    unitNumber,
    residenceType,
    utilityFile,
    requireUtilityFile = true,
    requireResidenceType = true,
    guestMode = false,
  } = input;

  const nameErr = requiredText(name, "Full name", {
    min: 2,
    max: COMPLETE_PROFILE_LIMITS.profileName,
  });
  if (nameErr) errors.name = nameErr;

  const emailErr = validateUserEmail(email);
  if (emailErr) errors.email = emailErr;

  const bioText = String(bio ?? "").trim();
  if (bioText.length > COMPLETE_PROFILE_LIMITS.profileBio) {
    errors.bio = `Bio must be ${COMPLETE_PROFILE_LIMITS.profileBio} characters or less.`;
  }

  if (guestMode) {
    const unitText = String(unitNumber ?? "").trim();
    if (unitText.length > COMPLETE_PROFILE_LIMITS.profileUnit) {
      errors.unitNumber = `Unit number must be ${COMPLETE_PROFILE_LIMITS.profileUnit} characters or less.`;
    }
    return errors;
  }

  const unitErr = requiredText(unitNumber, "Unit number", {
    max: COMPLETE_PROFILE_LIMITS.profileUnit,
  });
  if (unitErr) errors.unitNumber = unitErr;

  if (requireResidenceType) {
    if (!residenceType) {
      errors.residenceType = "Residence type is required.";
    } else if (!["homeowner", "tenant"].includes(residenceType)) {
      errors.residenceType = "Select homeowner or tenant.";
    }
  }

  if (requireUtilityFile) {
    if (!utilityFile) {
      errors.utilityFile = "Lease or utility bill is required.";
    } else if (utilityFile.kind === "file") {
      if (utilityFile.file.size > COMPLETE_PROFILE_LIMITS.utilityBillMaxBytes) {
        errors.utilityFile = "File must be 10 MB or smaller.";
      }
    }
  } else if (utilityFile?.kind === "file") {
    if (utilityFile.file.size > COMPLETE_PROFILE_LIMITS.utilityBillMaxBytes) {
      errors.utilityFile = "File must be 10 MB or smaller.";
    }
  }

  return errors;
}
