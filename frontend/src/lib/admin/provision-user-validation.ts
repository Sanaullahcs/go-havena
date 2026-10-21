import { getPhoneValidationError, type PhoneFieldState } from "@/lib/phone/format";
import {
  COMMUNITY_ADMIN_NAME_MAX,
  COMMUNITY_ADMIN_NAME_MAX_MESSAGE,
  COMMUNITY_ADMIN_OFFICE_MAX,
  COMMUNITY_ADMIN_OFFICE_MAX_MESSAGE,
  exceedsCharacterLimit,
} from "@/lib/admin/community-admin-field-limits";
import {
  type FieldErrors,
  fieldInputClass,
  hasFieldErrors,
  validateEmailField,
  validateRequiredName,
} from "@/lib/admin/form-validation-utils";

export type CommunityAssignmentMode = "" | "existing" | "new";

export type ProvisionAdminForm = {
  name: string;
  email: string;
  phone: string;
  region_id: number | "";
  community_mode: CommunityAssignmentMode;
  community_id: number | "";
  community_name: string;
  community_address: string;
  community_description: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type ProvisionResidentForm = {
  name: string;
  email: string;
  phone: string;
  region_id: number | "";
  community_id: number | "";
};

export type ProvisionFieldErrors = FieldErrors;

export function validateProvisionPhone(phone: PhoneFieldState): string | null {
  if (!phone.digits.trim()) return "Phone number is required.";
  if (!phone.valid) {
    return getPhoneValidationError(phone.digits, phone.country) ?? "Enter a valid phone number.";
  }
  return null;
}

function validateRegion(regionId: number | ""): string | null {
  if (!regionId) return "Select a region.";
  return null;
}

export function validateCommunityAdminForm(
  form: ProvisionAdminForm,
  phone: PhoneFieldState,
): ProvisionFieldErrors {
  const errors: ProvisionFieldErrors = {};

  const nameError = validateRequiredName(form.name, "Full name");
  if (nameError) errors.name = nameError;

  const emailError = validateEmailField(form.email);
  if (emailError) errors.email = emailError;

  const phoneError = validateProvisionPhone(phone);
  if (phoneError) errors.phone = phoneError;

  const regionError = validateRegion(form.region_id);
  if (regionError) errors.region_id = regionError;

  if (form.community_mode === "existing") {
    if (!form.community_id) {
      errors.community_id = "Select an available community.";
    }
  } else if (form.community_mode === "new") {
    const communityName = form.community_name.trim();
    if (!communityName) {
      errors.community_name = "Community name is required.";
    } else if (communityName.length < 2) {
      errors.community_name = "Community name must be at least 2 characters.";
    } else if (communityName.length > 255) {
      errors.community_name = "Community name must be 255 characters or less.";
    }

    const address = form.community_address.trim();
    if (!address) {
      errors.community_address = "Community address is required.";
    } else if (address.length < 5) {
      errors.community_address = "Address must be at least 5 characters.";
    } else if (address.length > 500) {
      errors.community_address = "Address must be 500 characters or less.";
    }

    const description = form.community_description.trim();
    if (description.length > 1000) {
      errors.community_description = "Description must be 1000 characters or less.";
    }
  } else {
    errors.community_id = "Select a community or add a new one.";
  }

  return errors;
}

export function validateResidentForm(
  form: ProvisionResidentForm,
  phone: PhoneFieldState,
): ProvisionFieldErrors {
  const errors: ProvisionFieldErrors = {};

  const nameError = validateRequiredName(form.name, "Full name");
  if (nameError) errors.name = nameError;

  const emailError = validateEmailField(form.email);
  if (emailError) errors.email = emailError;

  const phoneError = validateProvisionPhone(phone);
  if (phoneError) errors.phone = phoneError;

  const regionError = validateRegion(form.region_id);
  if (regionError) errors.region_id = regionError;

  if (!form.community_id) {
    errors.community_id = "Select a community.";
  }

  return errors;
}

export function validateCommunityAdminEditForm(
  name: string,
  phone: PhoneFieldState,
  officeAddress: string,
): ProvisionFieldErrors {
  const errors: ProvisionFieldErrors = {};

  const nameValue = name.trim();
  if (!nameValue) {
    errors.name = "Full name is required.";
  } else if (nameValue.length < 2) {
    errors.name = "Full name must be at least 2 characters.";
  } else if (exceedsCharacterLimit(name, COMMUNITY_ADMIN_NAME_MAX)) {
    errors.name = COMMUNITY_ADMIN_NAME_MAX_MESSAGE;
  }

  const phoneError = validateProvisionPhone(phone);
  if (phoneError) errors.phone = phoneError;

  const office = officeAddress.trim();
  if (!office) {
    errors.officeAddress = "Office address is required.";
  } else if (exceedsCharacterLimit(officeAddress, COMMUNITY_ADMIN_OFFICE_MAX)) {
    errors.officeAddress = COMMUNITY_ADMIN_OFFICE_MAX_MESSAGE;
  }

  return errors;
}

export function hasProvisionErrors(errors: ProvisionFieldErrors): boolean {
  return hasFieldErrors(errors);
}

export { fieldInputClass, fieldInputClass as provisionInputClass };
