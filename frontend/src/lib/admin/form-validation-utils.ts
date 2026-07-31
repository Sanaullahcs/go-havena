export type FieldErrors = Partial<Record<string, string>>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function fieldInputClass(error?: string) {
  return ["nl-auth-input w-full", error ? "!border-red-300 !ring-1 !ring-red-100" : ""].join(" ");
}

export function inputClass(error?: string, base = "nl-input w-full") {
  return [base, error ? "border-red-300 ring-1 ring-red-100" : ""].join(" ");
}

export function validateEmailField(email: string): string | null {
  const value = email.trim();
  if (!value) return "Email address is required.";
  if (value.length > 255) return "Email must be 255 characters or less.";
  if (!EMAIL_RE.test(value)) return "Enter a valid email address.";
  if (value.toLowerCase().endsWith("@phone.nbrlink.local")) {
    return "Enter a personal email address.";
  }
  return null;
}

export function validateRequiredName(name: string, label = "Name"): string | null {
  const value = name.trim();
  if (!value) return `${label} is required.`;
  if (value.length < 2) return `${label} must be at least 2 characters.`;
  if (value.length > 100) return `${label} must be 100 characters or less.`;
  return null;
}

export function validateOptionalName(name: string): string | null {
  const value = name.trim();
  if (!value) return null;
  if (value.length < 2) return "Name must be at least 2 characters.";
  if (value.length > 100) return "Name must be 100 characters or less.";
  return null;
}
