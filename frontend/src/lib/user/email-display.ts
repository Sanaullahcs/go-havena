import { formatPhoneDisplay } from "@/lib/phone/format";

export const PLACEHOLDER_EMAIL_SUFFIX = "@phone.havena.local";

const PLACEHOLDER_NAMES = new Set([
  "my profile",
  "neighbor",
  "admin",
  "resident",
  "profile",
  "complete your profile",
]);

export function isPlaceholderEmail(email?: string | null): boolean {
  const value = String(email ?? "").trim().toLowerCase();
  return !value || value.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

/** Real user email for display, or null when only the phone-signup placeholder exists. */
export function formatDisplayEmail(email?: string | null): string | null {
  if (isPlaceholderEmail(email)) return null;
  return String(email ?? "").trim();
}

/** True when a name/label is actually a raw phone or phone-signup email. */
export function isPhoneLikeLabel(value?: string | null): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (raw.toLowerCase().includes(PLACEHOLDER_EMAIL_SUFFIX)) return true;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  const compact = raw.replace(/[\s().+-]/g, "");
  return compact === digits || compact === `+${digits}`;
}

function formattedPhoneOrEmpty(value?: string | null): string {
  const formatted = formatPhoneDisplay(value);
  return !formatted || formatted === "—" ? "" : formatted;
}

type AccountIdentity = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  profile?: { display_name?: string | null } | null;
};

/** Prefer a real name; otherwise show (555) 555-0100 — never 15555550100@phone.havena.local. */
export function formatAccountDisplayName(user: AccountIdentity | null | undefined, fallback = "Admin"): string {
  const name = String(user?.profile?.display_name || user?.name || "").trim();
  if (name && !isPhoneLikeLabel(name) && !PLACEHOLDER_NAMES.has(name.toLowerCase())) {
    return name;
  }
  return formattedPhoneOrEmpty(user?.phone) || formattedPhoneOrEmpty(user?.email) || fallback;
}

/** Real email, or the formatted phone used to sign in. */
export function formatAccountContact(user: AccountIdentity | null | undefined): string {
  return formatDisplayEmail(user?.email) || formattedPhoneOrEmpty(user?.phone) || formattedPhoneOrEmpty(user?.email) || "";
}
