import type { FieldErrors } from "@/lib/admin/form-validation-utils";

export type RegionFormLike = {
  title: string;
  area: string;
};

export function validateRegionForm(form: RegionFormLike): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.title.trim()) {
    errors.title = "Title is required.";
  }

  if (!form.area.trim()) {
    errors.area = "Area is required.";
  }

  return errors;
}
