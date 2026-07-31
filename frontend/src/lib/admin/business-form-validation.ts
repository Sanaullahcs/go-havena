import type { FieldErrors } from "@/lib/admin/form-validation-utils";

const LIMITS = {
  businessName: 200,
  businessCategory: 60,
  businessDescription: 2000,
  businessAddress: 255,
  businessHours: 120,
};

function requiredText(value: string, label: string, max?: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (max != null && trimmed.length > max) return `${label} must be ${max} characters or less.`;
  return null;
}

export type BusinessFormLike = {
  name: string;
  category: string;
  description: string;
  address: string;
  hours: string;
};

export function validateBusinessForm(
  form: BusinessFormLike,
  opts: { phoneValid: boolean; phoneDigits: string },
): FieldErrors {
  const errors: FieldErrors = {};

  const nameErr = requiredText(form.name, "Business name", LIMITS.businessName);
  if (nameErr) errors.name = nameErr;

  const catErr = requiredText(form.category, "Category", LIMITS.businessCategory);
  if (catErr) errors.category = catErr;

  const addrErr = requiredText(form.address, "Address", LIMITS.businessAddress);
  if (addrErr) errors.address = addrErr;

  if (!opts.phoneDigits.trim()) {
    errors.phone = "Phone number is required.";
  } else if (!opts.phoneValid) {
    errors.phone = "Enter a valid phone number.";
  }

  const hoursErr = requiredText(form.hours, "Business hours", LIMITS.businessHours);
  if (hoursErr) errors.hours = hoursErr;

  const descErr = requiredText(form.description, "Description", LIMITS.businessDescription);
  if (descErr) errors.description = descErr;

  return errors;
}
