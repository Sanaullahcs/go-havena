export const PLACEHOLDER_EMAIL_SUFFIX = "@phone.nbrlink.local";

export function isPlaceholderEmail(email?: string | null): boolean {
  const value = String(email ?? "").trim().toLowerCase();
  return !value || value.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

/** Real user email for display, or null when only the phone-signup placeholder exists. */
export function formatDisplayEmail(email?: string | null): string | null {
  if (isPlaceholderEmail(email)) return null;
  return String(email ?? "").trim();
}
