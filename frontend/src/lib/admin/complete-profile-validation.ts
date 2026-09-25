/**
 * Complete profile validation — aligned with apps/mobile/utils/form-validation.js
 * and backend ProfileController rules.
 */

import {
  COMMUNITY_ADMIN_NAME_MAX,
  COMMUNITY_ADMIN_NAME_MAX_MESSAGE,
  COMMUNITY_ADMIN_OFFICE_MAX,
  COMMUNITY_ADMIN_OFFICE_MAX_MESSAGE,
  COMMUNITY_ADMIN_UNIT_MAX,
  COMMUNITY_ADMIN_UNIT_MAX_MESSAGE,
  exceedsCharacterLimit,
} from "@/lib/admin/community-admin-field-limits";
import { EMAIL_RE, type FieldErrors } from "@/lib/admin/form-validation-utils";
import { getPhoneValidationError } from "@/lib/phone/format";

export const COMPLETE_PROFILE_LIMITS = {
  profileName: 50,
  profileUnit: 50,
  profileEmail: 255,
  profileBio: 500,
  utilityBillMaxBytes: 10 * 1024 * 1024,
} as const;

const UTILITY_BILL_EXTENSION = /\.(jpe?g|png|heic|heif|pdf)$/i;
const UTILITY_BILL_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export const UTILITY_BILL_ACCEPT =
  ".jpg,.jpeg,.png,.pdf,.heic,.heif,image/jpeg,image/png,application/pdf";

export const UTILITY_BILL_TYPE_MESSAGE = "Upload a JPG, PNG, HEIC, or PDF file.";
export const UTILITY_BILL_SIZE_MESSAGE = "File must be 10 MB or smaller.";

/** Optional document check. A missing file is valid. */
export function utilityBillFileError(file: File | null | undefined): string | null {
  if (!file) return null;
  const mime = (file.type || "").toLowerCase();
  const extensionOk = UTILITY_BILL_EXTENSION.test(file.name);
  const mimeOk = mime === "" || UTILITY_BILL_MIME.has(mime);
  if (!extensionOk || !mimeOk) return UTILITY_BILL_TYPE_MESSAGE;
  if (file.size > COMPLETE_PROFILE_LIMITS.utilityBillMaxBytes) return UTILITY_BILL_SIZE_MESSAGE;
  return null;
}

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
  phoneDigits?: string;
  phoneCountry?: string;
  bio: string;
  unitNumber: string;
  residenceType: string;
  officeAddress?: string;
  utilityFile: UtilityFileInput;
  requireUtilityFile?: boolean;
  requireResidenceType?: boolean;
  requireUnitNumber?: boolean;
  requireOfficeAddress?: boolean;
  guestMode?: boolean;
  communityAdmin?: boolean;
}): FieldErrors {
  const errors: FieldErrors = {};
  const {
    name,
    email,
    phoneDigits,
    phoneCountry,
    bio,
    unitNumber,
    residenceType,
    officeAddress = "",
    utilityFile,
    requireUtilityFile = true,
    requireResidenceType = true,
    requireUnitNumber,
    requireOfficeAddress,
    guestMode = false,
    communityAdmin = false,
  } = input;
  const unitIsRequired = requireUnitNumber ?? (!guestMode && !communityAdmin);
  const officeIsRequired = requireOfficeAddress ?? communityAdmin;

  const nameMax = communityAdmin ? COMMUNITY_ADMIN_NAME_MAX : COMPLETE_PROFILE_LIMITS.profileName;
  const unitMax = communityAdmin ? COMMUNITY_ADMIN_UNIT_MAX : COMPLETE_PROFILE_LIMITS.profileUnit;

  const nameErr = requiredText(name, "Full name", {
    min: 2,
    max: nameMax,
  });
  if (nameErr) {
    errors.name =
      communityAdmin && exceedsCharacterLimit(name, nameMax)
        ? COMMUNITY_ADMIN_NAME_MAX_MESSAGE
        : nameErr;
  }

  const emailErr = validateUserEmail(email);
  if (emailErr) errors.email = emailErr;

  const digits = String(phoneDigits ?? "").trim();
  if (!digits) {
    errors.phone = "Phone number is required.";
  } else {
    const phoneErr = getPhoneValidationError(digits, phoneCountry);
    if (phoneErr) errors.phone = phoneErr;
  }

  const bioText = String(bio ?? "").trim();
  if (bioText.length > COMPLETE_PROFILE_LIMITS.profileBio) {
    errors.bio = `Bio must be ${COMPLETE_PROFILE_LIMITS.profileBio} characters or less.`;
  }

  if (guestMode) {
    const unitText = String(unitNumber ?? "").trim();
    if (unitNumber.length > unitMax || unitText.length > unitMax) {
      errors.unitNumber = `Unit number must be ${unitMax} characters or less.`;
    }
    return errors;
  }

  if (officeIsRequired) {
    const officeErr = requiredText(officeAddress, "Office address", {
      max: COMMUNITY_ADMIN_OFFICE_MAX,
    });
    if (officeErr) {
      errors.officeAddress = exceedsCharacterLimit(officeAddress, COMMUNITY_ADMIN_OFFICE_MAX)
        ? COMMUNITY_ADMIN_OFFICE_MAX_MESSAGE
        : officeErr;
    }
  } else if (String(officeAddress ?? "").trim().length > COMMUNITY_ADMIN_OFFICE_MAX) {
    errors.officeAddress = COMMUNITY_ADMIN_OFFICE_MAX_MESSAGE;
  }

  if (unitIsRequired) {
  const unitErr = requiredText(unitNumber, "Unit number", {
    max: unitMax,
  });
  if (unitErr) {
    errors.unitNumber =
      communityAdmin && exceedsCharacterLimit(unitNumber, unitMax)
        ? COMMUNITY_ADMIN_UNIT_MAX_MESSAGE
        : unitErr;
  }
  }

  if (requireResidenceType && !communityAdmin) {
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
