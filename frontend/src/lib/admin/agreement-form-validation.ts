import type { FieldErrors } from "@/lib/admin/form-validation-utils";
import { validateTitleAndDescription } from "@/lib/admin/document-form-validation";

function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function requiredDate(value: string, label: string, today: string): string | null {
  if (!value) return `${label} is required.`;
  if (value < today) return `${label} cannot be in the past.`;
  return null;
}

export function validateAgreementDetails(form: {
  title: string;
  description?: string;
  category: string;
  dueAt: string;
  effectiveAt: string;
  expiresAt: string;
  hasFile: boolean;
}): FieldErrors {
  const errors: FieldErrors = validateTitleAndDescription(form.title, form.description ?? "");
  const today = localToday();
  const category = form.category.trim();

  if (!category) errors.category = "Category is required.";
  else if (category.length > 100) errors.category = "Category must be 100 characters or less.";

  const dueError = requiredDate(form.dueAt, "Due date", today);
  if (dueError) errors.dueAt = dueError;

  const effectiveError = requiredDate(form.effectiveAt, "Effective date", today);
  if (effectiveError) errors.effectiveAt = effectiveError;

  const expiresError = requiredDate(form.expiresAt, "Expiration date", today);
  if (expiresError) errors.expiresAt = expiresError;
  else if (form.effectiveAt && form.expiresAt < form.effectiveAt) {
    errors.expiresAt = "Expiration date must be on or after the effective date.";
  } else if (form.dueAt && form.expiresAt < form.dueAt) {
    errors.expiresAt = "Expiration date must be on or after the due date.";
  }

  if (!form.hasFile) errors.file = "Choose a PDF to upload.";

  return errors;
}
