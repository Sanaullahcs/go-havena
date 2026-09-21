import type { FieldErrors } from "@/lib/admin/form-validation-utils";

const LIMITS = { documentTitle: 200, documentCategory: 100 };

function requiredText(value: string, label: string, max?: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (max != null && trimmed.length > max) return `${label} must be ${max} characters or less.`;
  return null;
}

export function validateDocumentForm(
  form: { title: string; category: string },
  opts: { hasFile: boolean },
): FieldErrors {
  const errors: FieldErrors = {};

  const titleErr = requiredText(form.title, "Title", LIMITS.documentTitle);
  if (titleErr) errors.title = titleErr;

  const catErr = requiredText(form.category, "Category", LIMITS.documentCategory);
  if (catErr) errors.category = catErr;

  if (!opts.hasFile) errors.file = "Choose a file to upload.";

  return errors;
}
