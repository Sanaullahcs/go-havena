import {
  AsYouType,
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  validatePhoneNumberLength,
  formatIncompletePhoneNumber,
} from "libphonenumber-js/min";
import { DEFAULT_PHONE_COUNTRY, formatDialLabel, getCountryByCode } from "./countries";

export type PhoneFieldState = {
  country: string;
  digits: string;
  e164: string;
  valid: boolean;
};

export const emptyPhoneField = (): PhoneFieldState => ({
  country: DEFAULT_PHONE_COUNTRY,
  digits: "",
  e164: "",
  valid: false,
});

function parseForCountry(digits: string, country: string) {
  if (!digits) return null;
  try {
    const dial = formatDialLabel(country).replace("+", "");
    return (
      parsePhoneNumberFromString(digits, country as never) ||
      parsePhoneNumberFromString(`+${dial}${digits}`, country as never)
    );
  } catch {
    return null;
  }
}

/** NANP (US/CA): 10 digits, area & exchange cannot start with 0 or 1. */
function isValidNanpNational(digits: string): boolean {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);
}

function formatNanpNational(digits: string): string {
  if (digits.length !== 10) return digits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Progressive US/CA display while typing — avoids libphonenumber throws on 555 test lines. */
function formatNanpPartial(digits: string): string {
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function formatNanpInternational(digits: string): string {
  if (digits.length !== 10) return digits;
  return `+1 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** Normalize raw stored value to E.164 when possible. */
export function normalizePhoneE164(input: string | null | undefined): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@phone.havena.local")) {
    return normalizePhoneE164(raw.replace("@phone.havena.local", ""));
  }
  if (raw.startsWith("+")) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1") && isValidNanpNational(digits.slice(1))) {
      return `+1${digits.slice(1)}`;
    }
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1") && isValidNanpNational(digits.slice(1))) {
    return `+1${digits.slice(1)}`;
  }
  if (digits.length === 10 && isValidNanpNational(digits)) {
    return `+1${digits}`;
  }
  const parsed = parsePhoneNumberFromString(raw.startsWith("+") ? raw : digits, "US" as never);
  if (parsed?.number) return parsed.number;
  return raw.startsWith("+") ? raw : "";
}

function phoneLengthStatus(digits: string, country: string): ReturnType<typeof validatePhoneNumberLength> | null {
  if (!digits) return null;
  try {
    return validatePhoneNumberLength(digits, country as never);
  } catch {
    // libphonenumber-js/min can throw on some inputs (e.g. 555 test lines).
    return null;
  }
}

/** Trim pasted/over-typed digits once libphonenumber marks the number too long. */
function clampNationalDigits(digits: string, country: string): string {
  if (!digits) return "";
  let next = digits.replace(/\D/g, "");
  while (next.length > 0 && phoneLengthStatus(next, country) === "TOO_LONG") {
    next = next.slice(0, -1);
  }
  // US/CA national numbers are always 10 digits.
  if ((country === "US" || country === "CA") && next.length > 10) {
    next = next.slice(0, 10);
  }
  return next;
}

export function buildPhoneField(country: string, digits: string): PhoneFieldState {
  const valid = isValidPhone(digits, country);
  return {
    country,
    digits,
    e164: valid ? toE164(digits, country) : "",
    valid,
  };
}

export function phoneFieldFromE164(e164: string | null | undefined): PhoneFieldState {
  const parsed = parseE164ToFields(e164);
  return buildPhoneField(parsed.country, parsed.digits);
}

export function formatNationalDisplay(digits: string, country = DEFAULT_PHONE_COUNTRY): string {
  if (!digits) return "";
  if (country === "US" || country === "CA") {
    return formatNanpPartial(digits);
  }
  try {
    const parsed = parseForCountry(digits, country);
    if (parsed?.isValid()) return parsed.formatNational();
    const incomplete = formatIncompletePhoneNumber(digits, country as never);
    if (incomplete && incomplete !== digits) return incomplete;
    const asYouType = new AsYouType(country as never).input(digits);
    if (asYouType && asYouType !== digits) return asYouType;
  } catch {
    // Fall through to raw digits when libphonenumber is unavailable.
  }
  return digits;
}

export function extractNationalDigits(input: string, country = DEFAULT_PHONE_COUNTRY): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (country === "US" || country === "CA") {
    let digits = raw.replace(/\D/g, "");
    const dial = formatDialLabel(country).replace("+", "");
    if (digits.startsWith(dial) && digits.length > dial.length) {
      digits = digits.slice(dial.length);
    }
    return digits.slice(0, 10);
  }
  try {
    const typer = new AsYouType(country as never);
    typer.input(raw);
    const parsed = typer.getNumber();
    if (parsed?.nationalNumber) return parsed.nationalNumber.replace(/\D/g, "");
  } catch {
    // Fall through to digit extraction when libphonenumber metadata is unavailable.
  }
  let digits = raw.replace(/\D/g, "");
  const dial = formatDialLabel(country).replace("+", "");
  if (digits.startsWith(dial) && digits.length > dial.length) {
    digits = digits.slice(dial.length);
  }
  return digits;
}

export function parsePhoneInputChange(text: string, country: string, previousDigits = ""): string {
  const cleaned = String(text ?? "");
  if (!cleaned.trim()) return "";
  const prevDisplay = formatNationalDisplay(previousDigits, country);
  const rawDigits = cleaned.replace(/\D/g, "");
  if (previousDigits) {
    if (rawDigits.length < previousDigits.length) return rawDigits;
    if (cleaned.length < prevDisplay.length && rawDigits.length >= previousDigits.length) {
      return previousDigits.slice(0, -1);
    }
  }
  return clampNationalDigits(extractNationalDigits(cleaned, country), country);
}

export function isValidPhone(digits: string, country = DEFAULT_PHONE_COUNTRY): boolean {
  if (!digits) return false;
  // Match backend PhoneNormalizer: accept structurally valid US/CA numbers
  // (includes local dev/test lines like 555-666-8888 that libphonenumber rejects).
  if ((country === "US" || country === "CA") && isValidNanpNational(digits)) return true;
  try {
    if (isValidPhoneNumber(digits, country as never)) return true;
  } catch {
    // libphonenumber-js/min can throw when metadata is unavailable.
  }
  return false;
}

export function getPhonePlaceholder(country = DEFAULT_PHONE_COUNTRY): string {
  const sample = formatNationalDisplay("5555550100", country);
  if (!sample) return "Phone number";
  return sample.replace(/\d/g, "0");
}

export function getPhoneProgressHint(digits: string, country = DEFAULT_PHONE_COUNTRY): string | null {
  if (!digits) return null;
  if (isValidPhone(digits, country)) return null;

  const lengthStatus = phoneLengthStatus(digits, country);
  const selected = getCountryByCode(country);

  if (lengthStatus === "TOO_SHORT") {
    const parsed = parseForCountry(digits, country);
    const formatted = parsed?.formatNational() ?? formatNationalDisplay(digits, country);
    if (country === "US" || country === "CA") {
      return `Keep typing — 10 digits total · ${formatted}`;
    }
    return `Keep typing your ${selected.name} number · ${formatted}`;
  }

  if (lengthStatus === "TOO_LONG") {
    return country === "US" || country === "CA"
      ? "US numbers are 10 digits (country code is already selected)"
      : `Too many digits for ${selected.name}`;
  }

  return country === "US" || country === "CA"
    ? "Enter a valid 10-digit US number"
    : `Use your ${selected.name} mobile format`;
}

export function getPhoneValidationError(digits: string, country = DEFAULT_PHONE_COUNTRY): string | null {
  if (!digits) return null;
  if (isValidPhone(digits, country)) return null;
  const selected = getCountryByCode(country);
  const lengthStatus = phoneLengthStatus(digits, country);
  if (lengthStatus === "TOO_SHORT") {
    return country === "US" || country === "CA"
      ? "Enter a complete 10-digit US number"
      : `Enter a complete ${selected.name} number`;
  }
  if (lengthStatus === "TOO_LONG") {
    return country === "US" || country === "CA"
      ? "US numbers are 10 digits — country code is already selected"
      : `Number is too long for ${selected.name}`;
  }
  return country === "US" || country === "CA"
    ? "Enter a valid 10-digit US number"
    : `Enter a valid ${selected.name} phone number`;
}

export function toE164(digits: string, country = DEFAULT_PHONE_COUNTRY): string {
  if (!digits || !isValidPhone(digits, country)) return "";
  if ((country === "US" || country === "CA") && isValidNanpNational(digits)) {
    return `+1${digits}`;
  }
  const parsed = parseForCountry(digits, country);
  if (parsed?.isValid()) return parsed.number ?? "";
  return "";
}

/** Format stored E.164 or raw phone for display in tables and detail views. */
export function formatPhoneDisplay(input: string | null | undefined): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "—";
  if (raw.includes("@phone.havena.local")) {
    return formatPhoneDisplay(raw.replace("@phone.havena.local", ""));
  }
  if (raw.includes("@")) return raw;

  const e164 = normalizePhoneE164(raw);
  if (e164) {
    const parsed = parsePhoneNumberFromString(e164);
    if (parsed) {
      try {
        return parsed.formatInternational();
      } catch {
        /* fall through */
      }
    }
    const national = e164.replace(/^\+1/, "").replace(/\D/g, "");
    if (national.length === 10 && isValidNanpNational(national)) {
      return formatNanpInternational(national);
    }
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && isValidNanpNational(digits)) {
    return formatNanpInternational(digits);
  }
  if (digits.length === 11 && digits.startsWith("1") && isValidNanpNational(digits.slice(1))) {
    return formatNanpInternational(digits.slice(1));
  }

  const parsed = parsePhoneNumberFromString(raw.startsWith("+") ? raw : raw, "US" as never);
  if (parsed) {
    try {
      return parsed.formatInternational();
    } catch {
      /* fall through */
    }
  }

  return raw;
}

export function parseE164ToFields(e164: string | null | undefined): {
  country: string;
  digits: string;
} {
  const raw = String(e164 ?? "").trim();
  if (!raw) return { country: DEFAULT_PHONE_COUNTRY, digits: "" };

  const normalized = normalizePhoneE164(raw);
  const parsed = parsePhoneNumberFromString(normalized || raw);
  if (parsed?.nationalNumber) {
    return {
      country: parsed.country ?? DEFAULT_PHONE_COUNTRY,
      digits: parsed.nationalNumber.replace(/\D/g, ""),
    };
  }

  const digits = (normalized || raw).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return { country: "US", digits: digits.slice(1) };
  }
  if (digits.length === 10 && isValidNanpNational(digits)) {
    return { country: "US", digits };
  }

  return { country: DEFAULT_PHONE_COUNTRY, digits: digits };
}

export function isPhoneValueValid(value: string): boolean {
  return phoneFieldFromE164(value).valid;
}
