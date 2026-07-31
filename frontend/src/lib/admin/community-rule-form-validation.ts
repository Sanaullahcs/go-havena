import type { FieldErrors } from "@/lib/admin/form-validation-utils";

const LIMITS = { ruleTitle: 200, ruleCategory: 100 };

function requiredText(value: string, label: string, max?: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (max != null && trimmed.length > max) return `${label} must be ${max} characters or less.`;
  return null;
}

export function validateCommunityRuleForm(form: {
  title: string;
  category: string;
  description: string;
  severity?: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  const titleErr = requiredText(form.title, "Title", LIMITS.ruleTitle);
  if (titleErr) errors.title = titleErr;

  const catErr = requiredText(form.category, "Category", LIMITS.ruleCategory);
  if (catErr) errors.category = catErr;

  const descErr = requiredText(form.description, "Description");
  if (descErr) errors.description = descErr;

  if (form.severity && !["important", "standard", "info"].includes(form.severity)) {
    errors.severity = "Select a valid severity.";
  }

  return errors;
}
