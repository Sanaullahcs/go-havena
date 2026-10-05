import {
  AsYouType,
  Metadata,
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  validatePhoneNumberLength,
  formatIncompletePhoneNumber,
} from "libphonenumber-js/max";
import { DEFAULT_PHONE_COUNTRY, formatDialLabel, getCountryByCode } from "./countries";

const metadataReader = new Metadata();
const maxLengthCache = new Map<string, number>();

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
    return null;
  }
}

/** Longest national number the selected country can accept. */
function maxNationalLength(country: string): number {
  const cached = maxLengthCache.get(country);
  if (cached) return cached;
  let max = 15;
  try {
    metadataReader.selectNumberingPlan(country as never);
    const lengths = metadataReader.numberingPlan.possibleLengths();
    if (lengths.length) max = Math.max(...lengths);
  } catch {
    for (let length = 1; length <= 16; length += 1) {
      if (phoneLengthStatus("9".repeat(length), country) === "TOO_LONG") {
        max = length - 1;
        break;
      }
    }
  }
  if (max < 1) max = 15;
  maxLengthCache.set(country, max);
  return max;
}

/**
 * Stop at the selected country's maximum. Extra typed or pasted digits are
 * dropped so the field never holds a number that is too long.
 */
function clampNationalDigits(digits: string, country: string): string {
  const next = digits.replace(/\D/g, "");
  if (!next) return "";
  const limit = maxNationalLength(country);
  let clamped = next.length > limit ? next.slice(0, limit) : next;
  while (clamped.length > 0 && phoneLengthStatus(clamped, country) === "TOO_LONG") {
    clamped = clamped.slice(0, -1);
  }
  return clamped;
}

/** True while the number is still shorter than the selected country's minimum. */
export function isPhoneEntryIncomplete(digits: string, country = DEFAULT_PHONE_COUNTRY): boolean {
  if (!digits) return true;
  return phoneLengthStatus(digits, country) === "TOO_SHORT";
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
    return clampNationalDigits(digits, country);
  }
  try {
    const typer = new AsYouType(country as never);
    typer.input(raw);
    const parsed = typer.getNumber();
    if (parsed?.nationalNumber) {
      return clampNationalDigits(parsed.nationalNumber.replace(/\D/g, ""), country);
    }
  } catch {
    // Fall through to digit extraction when libphonenumber metadata is unavailable.
  }
  let digits = raw.replace(/\D/g, "");
  const dial = formatDialLabel(country).replace("+", "");
  if (digits.startsWith(dial) && digits.length > dial.length) {
    digits = digits.slice(dial.length);
  }
  return clampNationalDigits(digits, country);
}

export function parsePhoneInputChange(text: string, country: string, previousDigits = ""): string {
  const cleaned = String(text ?? "");
  if (!cleaned.trim()) return "";
  const prevDisplay = formatNationalDisplay(previousDigits, country);
  const rawDigits = cleaned.replace(/\D/g, "");
  if (previousDigits) {
    if (rawDigits.length < previousDigits.length) return clampNationalDigits(rawDigits, country);
    if (cleaned.length < prevDisplay.length && rawDigits.length >= previousDigits.length) {
      return previousDigits.slice(0, -1);
    }
  }
  return clampNationalDigits(extractNationalDigits(cleaned, country), country);
}

export function isValidPhone(digits: string, country = DEFAULT_PHONE_COUNTRY): boolean {
  if (!digits) return false;
  try {
    return isValidPhoneNumber(digits, country as never);
  } catch {
    return false;
  }
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
  const parsed = parseForCountry(digits, country);
  if (parsed?.isValid()) return parsed.number ?? "";
  return "";
}

function formatParsedPhoneDisplay(parsed: NonNullable<ReturnType<typeof parsePhoneNumberFromString>>): string {
  const national = String(parsed.nationalNumber ?? "").replace(/\D/g, "");
  if (
    (parsed.country === "US" || parsed.country === "CA" || parsed.countryCallingCode === "1") &&
    national.length === 10 &&
    isValidNanpNational(national)
  ) {
    return formatNanpNational(national);
  }
  try {
    return parsed.country === "US" || parsed.country === "CA"
      ? parsed.formatNational()
      : parsed.formatInternational();
  } catch {
    return parsed.number ?? national;
  }
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
      const formatted = formatParsedPhoneDisplay(parsed);
      if (formatted) return formatted;
    }
    const national = e164.replace(/^\+1/, "").replace(/\D/g, "");
    if (national.length === 10 && isValidNanpNational(national)) {
      return formatNanpNational(national);
    }
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && isValidNanpNational(digits)) {
    return formatNanpNational(digits);
  }
  if (digits.length === 11 && digits.startsWith("1") && isValidNanpNational(digits.slice(1))) {
    return formatNanpNational(digits.slice(1));
  }

  const parsed = parsePhoneNumberFromString(raw.startsWith("+") ? raw : raw, "US" as never);
  if (parsed) {
    const formatted = formatParsedPhoneDisplay(parsed);
    if (formatted) return formatted;
  }

  return raw;
}

/** Replace E.164 / raw phone tokens inside mixed dashboard copy. */
export function formatPhonesInText(input: string | null | undefined): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const withoutPlaceholderEmail = raw.replace(
    /(\+?\d[\d\s().+-]{6,}\d)@phone\.havena\.local/gi,
    (_, phone: string) => {
      const formatted = formatPhoneDisplay(phone);
      return !formatted || formatted === "—" ? phone : formatted;
    },
  );
  return withoutPlaceholderEmail.replace(/\+?\d[\d\s().-]{6,}\d/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 10) return match;
    const formatted = formatPhoneDisplay(match);
    return !formatted || formatted === "—" ? match : formatted;
  });
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
