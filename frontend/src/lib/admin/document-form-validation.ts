import type { FieldErrors } from "@/lib/admin/form-validation-utils";

const LIMITS = { title: 200, description: 5000, category: 100 };

function letterPattern() {
  return /\p{L}/u;
}

export function validateTitleAndDescription(title: string, description: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();

  if (!trimmedTitle) errors.title = "Title is required.";
  else if (trimmedTitle.length < 3) errors.title = "Title must be at least 3 characters.";
  else if (title.length > LIMITS.title) errors.title = "Title must be 200 characters or less.";
  else if (!letterPattern().test(trimmedTitle)) errors.title = "Title must include at least one letter.";

  if (!trimmedDescription) errors.description = "Description is required.";
  else if (trimmedDescription.length < 10) errors.description = "Description must be at least 10 characters.";
  else if (description.length > LIMITS.description) errors.description = "Description must be 5000 characters or less.";

  return errors;
}

export function validateDocumentForm(
  form: { title: string; category: string; description?: string },
  opts: { hasFile: boolean },
): FieldErrors {
  const errors = validateTitleAndDescription(form.title, form.description ?? "");

  const category = form.category.trim();
  if (!category) errors.category = "Category is required.";
  else if (category.length > LIMITS.category) errors.category = "Category must be 100 characters or less.";

  if (!opts.hasFile) errors.file = "Choose a file to upload.";

  return errors;
}
