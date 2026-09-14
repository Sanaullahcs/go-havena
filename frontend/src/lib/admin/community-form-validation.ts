import type { FieldErrors } from "@/lib/admin/form-validation-utils";
import { validateRequiredName } from "@/lib/admin/form-validation-utils";

export type CommunityFormLike = {
  name: string;
  region_id: number | "";
  address: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
};

export function validateCommunityForm(form: CommunityFormLike): FieldErrors {
  const errors: FieldErrors = {};

  const nameError = validateRequiredName(form.name, "Community name");
  if (nameError) errors.name = nameError;

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
