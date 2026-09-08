import type { FieldErrors } from "@/lib/admin/form-validation-utils";

export type RegionFormLike = {
  title: string;
  area: string;
  country_id: number | "";
  state_id: number | "";
};

export function validateRegionForm(form: RegionFormLike): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.country_id) {
    errors.country_id = "Country is required.";
  }

  if (!form.state_id) {
    errors.state_id = "State / province is required.";
  }

  if (!form.title.trim()) {
    errors.title = "Title is required.";
  }

  if (!form.area.trim()) {
    errors.area = "Area is required.";
  }

  return errors;
}
