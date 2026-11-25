import type { FieldErrors } from "@/lib/admin/form-validation-utils";
import { validateRequiredName } from "@/lib/admin/form-validation-utils";

export const DUPLICATE_COMMUNITY_NAME_MESSAGE =
  "A community with this name already exists. Please use a different name.";

export type CommunityFormLike = {
  name: string;
  region_id: number | "";
  address: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type ExistingCommunityName = {
  id: number;
  name: string;
};

export function normalizeCommunityName(name: string): string {
  return name.trim().toLowerCase();
}

export function validateCommunityForm(
  form: CommunityFormLike,
  options?: { existing?: ExistingCommunityName[]; exceptId?: number | null },
): FieldErrors {
  const errors: FieldErrors = {};

  const nameError = validateRequiredName(form.name, "Community name");
  if (nameError) {
    errors.name = nameError;
  } else {
    const normalized = normalizeCommunityName(form.name);
    const duplicate = (options?.existing ?? []).some(
      (item) => item.id !== options?.exceptId && normalizeCommunityName(item.name) === normalized,
    );
    if (duplicate) errors.name = DUPLICATE_COMMUNITY_NAME_MESSAGE;
  }

  if (!form.region_id) {
    errors.region_id = "Select a region.";
  }

  const address = form.address.trim();
  if (!address) {
    errors.address = "Address is required.";
  } else if (address.length < 5) {
    errors.address = "Enter a full street address (at least 5 characters).";
  } else if (address.length > 500) {
    errors.address = "Address must be 500 characters or less.";
  }

  return errors;
}
