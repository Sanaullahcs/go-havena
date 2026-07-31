import type { FieldErrors } from "@/lib/admin/form-validation-utils";
import { validateRequiredName } from "@/lib/admin/form-validation-utils";

export type CommunityFormLike = {
  name: string;
  region_id: number | "";
  address: string;
  description: string;
};

export function validateCommunityForm(form: CommunityFormLike): FieldErrors {
  const errors: FieldErrors = {};

  const nameError = validateRequiredName(form.name, "Community name");
  if (nameError) errors.name = nameError;

  if (!form.region_id) {
    errors.region_id = "Select a region.";
  }

  return errors;
}
