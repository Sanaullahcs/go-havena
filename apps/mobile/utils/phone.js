import {
  AsYouType,
  parsePhoneNumberFromString,
  getCountryCallingCode,
  formatIncompletePhoneNumber,
  Metadata,
} from "libphonenumber-js/min";
import metadata from "libphonenumber-js/min/metadata";
import {
  isValidPhoneNumber,
  validatePhoneNumberLength,
} from "libphonenumber-js/max";

import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  formatDialLabel,
  getCountryByCode,
  getPlaceholderDigits,
} from "../constants/phone-countries";

export { DEFAULT_PHONE_COUNTRY };

/** @deprecated use country-aware validation */
export const US_PHONE_LENGTH = 10;

const metadataReader = new Metadata(metadata);
const NANP_COUNTRIES = new Set(["US", "CA"]);

function isNanpCountry(country) {
  return NANP_COUNTRIES.has(country);
}

function looksLikeNANP(digits) {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);
}

/** NANP (US/CA): 10 digits; area & exchange cannot start with 0 or 1. */
export function isValidNanpNational(digits) {
  return looksLikeNANP(digits);
}

function hasUsDisplayFormat(digits) {
  const formatted = new AsYouType("US").input(digits);
  return /^\(\d{3}\) \d{3}-\d{4}$/.test(formatted);
}

export function getDialCode(country = DEFAULT_PHONE_COUNTRY) {
  try {
    return getCountryCallingCode(country);
  } catch {
    return "1";
  }
}

/** Parse in the context of the selected country */
export function parseForSelectedCountry(digits, country = DEFAULT_PHONE_COUNTRY) {
  if (!digits) return null;
  const dial = getDialCode(country);
  return (
    parsePhoneNumberFromString(digits, country) ||
    parsePhoneNumberFromString(`+${dial}${digits}`, country)
  );
}

export function getCountryPlaceholder(country = DEFAULT_PHONE_COUNTRY) {
  return formatNationalDisplay(getPlaceholderDigits(country), country);
}

export function getMaxNationalLength(country = DEFAULT_PHONE_COUNTRY) {
  try {
    metadataReader.selectNumberingPlan(country);
    const lengths = metadataReader.numberingPlan.possibleLengths();
    return lengths.length ? Math.max(...lengths) : 15;
  } catch {
    return 15;
  }
}

export function getFormattedMaxLength(country = DEFAULT_PHONE_COUNTRY) {
  const maxNational = getMaxNationalLength(country);
  const sample = "9".repeat(maxNational);
  return Math.max(formatNationalDisplay(sample, country).length + 4, maxNational + 4);
}

function isUsFictionalNumber(digits) {
  if (!looksLikeNANP(digits)) return false;
  const area = digits.slice(0, 3);
  // 555 = fictional US numbers; reject on non-+1 country codes
  return area === "555";
}

/**
 * Helpful mismatch hints — only when the number is NOT valid for the selected country,
 * or when a clearly US-only pattern is used with another country code.
 */
function getCountryMismatchError(digits, selectedCountry) {
  if (!digits) return null;

  const validForSelected = isValidPhoneNumber(digits, selectedCountry);
  const selected = getCountryByCode(selectedCountry);
  const selectedDial = formatDialLabel(selectedCountry);
  const validUs = isValidPhoneNumber(digits, "US");
  const validGb = isValidPhoneNumber(digits, "GB");

  if (
    !isNanpCountry(selectedCountry) &&
    isUsFictionalNumber(digits)
  ) {
    return "This looks like a US number. Select +1 as the country code above.";
  }

  if (validForSelected) return null;

  if (!isNanpCountry(selectedCountry) && validUs) {
    const usParsed = parseForSelectedCountry(digits, "US");
    if (usParsed?.country === "US" || usParsed?.country === "CA") {
      const match = getCountryByCode(usParsed.country === "CA" ? "CA" : "US");
      return `This is a ${match.name} number. Select +1 above or enter a ${selected.name} number.`;
    }
  }

  if (
    !isNanpCountry(selectedCountry) &&
    hasUsDisplayFormat(digits) &&
    looksLikeNANP(digits)
  ) {
    return `This looks like a US number. Select +1 as the country code above.`;
  }

  if (selectedCountry !== "GB" && validGb) {
    const gbParsed = parseForSelectedCountry(digits, "GB");
    if (gbParsed?.isValid()) {
      const compact = gbParsed.formatNational().replace(/\s/g, "");
      if (/^0[127]/.test(compact) || /^07/.test(compact)) {
        return `This is a United Kingdom number. Select +44 above or enter a ${selected.name} number.`;
      }
    }
  }

  if (selectedCountry !== "GB" && /^7\d{9}$/.test(digits) && validGb) {
    return `This looks like a UK mobile number. Select +44 above or enter a ${selected.name} number.`;
  }

  return null;
}

export function clampNationalDigits(digits, country = DEFAULT_PHONE_COUNTRY) {
  const raw = String(digits ?? "").replace(/\D/g, "");
  if (!raw) return "";

  let lastGood = "";

  for (const char of raw) {
    const candidate = lastGood + char;
    const typer = new AsYouType(country);
    typer.input(candidate);
    const national = typer.getNationalNumber();

    if (!national) continue;

    if (validatePhoneNumberLength(national, country) === "TOO_LONG") {
      break;
    }

    if (national.length > getMaxNationalLength(country)) {
      break;
    }

    lastGood = national;
  }

  return lastGood;
}

export function normalizeDigitsForCountry(digits, country = DEFAULT_PHONE_COUNTRY) {
  if (!digits) return "";
  return clampNationalDigits(digits, country);
}

/** Split a saved phone into the country code and national digits. */
export function splitStoredPhone(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { country: DEFAULT_PHONE_COUNTRY, digits: "" };

  const candidates = [raw];
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly && !raw.startsWith("+")) {
    candidates.push(`+${digitsOnly}`);
  }

  for (const candidate of candidates) {
    const parsed = parsePhoneNumberFromString(candidate);
    const country = String(parsed?.country ?? "").toUpperCase();
    const digits = String(parsed?.nationalNumber ?? "").replace(/\D/g, "");
    if (digits && PHONE_COUNTRIES.some((row) => row.code === country)) {
      return { country, digits };
    }
  }

  return {
    country: DEFAULT_PHONE_COUNTRY,
    digits: extractNationalDigits(raw),
  };
}

export function extractNationalDigits(input, country = DEFAULT_PHONE_COUNTRY) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  const typer = new AsYouType(country);
  typer.input(raw);
  const national = typer.getNationalNumber();
  if (national) return clampNationalDigits(national, country);

  let digits = raw.replace(/\D/g, "");
  const dial = getDialCode(country);
  if (digits.startsWith(dial) && digits.length > dial.length) {
    digits = digits.slice(dial.length);
  }

  return clampNationalDigits(digits, country);
}

export function parsePhoneInputChange(text, country = DEFAULT_PHONE_COUNTRY, previousDigits = "") {
  const cleaned = String(text ?? "");
  if (!cleaned.trim()) return "";

  const prev = String(previousDigits ?? "");
  const prevDisplay = formatNationalDisplay(prev, country);
  const rawDigits = cleaned.replace(/\D/g, "");

  if (prev) {
    if (rawDigits.length < prev.length) {
      return clampNationalDigits(rawDigits, country);
    }

    // Deleting a formatting character — digit count unchanged, so drop one digit.
    if (cleaned.length < prevDisplay.length && rawDigits.length >= prev.length) {
      return prev.slice(0, -1);
    }
  }

  return extractNationalDigits(cleaned, country);
}

/** Country-specific display — uses national format rules for the selected country */
export function formatNationalDisplay(digits, country = DEFAULT_PHONE_COUNTRY) {
  if (!digits) return "";

  const parsed = parseForSelectedCountry(digits, country);
  if (parsed?.isValid()) {
    return parsed.formatNational();
  }

  const incomplete = formatIncompletePhoneNumber(digits, country);
  if (incomplete && incomplete !== digits) {
    return incomplete;
  }

  return new AsYouType(country).input(digits);
}

export function formatInternationalDisplay(digits, country = DEFAULT_PHONE_COUNTRY) {
  if (!digits) return "";
  const parsed = parseForSelectedCountry(digits, country);
  if (parsed?.isValid()) return parsed.formatInternational();
  const dial = getDialCode(country);
  return `+${dial} ${formatNationalDisplay(digits, country)}`;
}

/** Valid for the selected country code — primary gate for the Send Code button */
export function isValidPhone(digits, country = DEFAULT_PHONE_COUNTRY) {
  if (!digits) return false;
  if (getCountryMismatchError(digits, country)) return false;
  return isValidPhoneNumber(digits, country);
}

export function isPhoneComplete(digits, country = DEFAULT_PHONE_COUNTRY) {
  if (!digits) return false;
  const lengthStatus = validatePhoneNumberLength(digits, country);
  return lengthStatus !== "TOO_SHORT" && lengthStatus !== "TOO_LONG" && isValidPhone(digits, country);
}

/** @deprecated use isValidPhone(digits, 'US') */
export function isValidUSPhone(digits) {
  return isValidPhone(digits, "US");
}

export function isStrictUSPhone(digits) {
  return isValidPhone(digits, "US");
}

export function getPhoneValidationError(digits, country = DEFAULT_PHONE_COUNTRY) {
  if (!digits) return null;

  const selected = getCountryByCode(country);
  const isNanp = isNanpCountry(country);

  if (isValidPhone(digits, country)) return null;

  const mismatch = getCountryMismatchError(digits, country);
  if (mismatch) return mismatch;

  const lengthStatus = validatePhoneNumberLength(digits, country);
  if (lengthStatus === "TOO_SHORT") {
    return isNanp
      ? "Enter a complete 10-digit US number"
      : `Enter a complete ${selected.name} number`;
  }
  if (lengthStatus === "TOO_LONG") {
    return isNanp
      ? "US numbers are 10 digits — country code is already selected"
      : `Number is too long for ${selected.name}`;
  }

  return isNanp
    ? "Enter a valid 10-digit US number"
    : `Enter a valid ${selected.name} phone number`;
}

export function toE164(digits, country = DEFAULT_PHONE_COUNTRY) {
  if (!digits || !isValidPhone(digits, country)) return "";
  const parsed = parseForSelectedCountry(digits, country);
  if (parsed?.isValid()) return parsed.number ?? "";
  return "";
}

export function toDisplayPhone(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().includes("@phone.havena.local")) {
    return toDisplayPhone(raw.replace(/@phone\.havena\.local$/i, ""));
  }
  const parsed = parsePhoneNumberFromString(raw);
  if (parsed) {
    const national = String(parsed.nationalNumber ?? "").replace(/\D/g, "");
    if (
      (parsed.country === "US" || parsed.country === "CA" || parsed.countryCallingCode === "1") &&
      isValidNanpNational(national)
    ) {
      return formatNationalDisplay(national, parsed.country || "US");
    }
    try {
      return parsed.country === "US" || parsed.country === "CA"
        ? parsed.formatNational()
        : parsed.formatInternational();
    } catch {
      return parsed.number || raw;
    }
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1") && isValidNanpNational(digits.slice(1))) {
    return formatNationalDisplay(digits.slice(1), "US");
  }
  if (digits.length === 10 && isValidNanpNational(digits)) {
    return formatNationalDisplay(digits, "US");
  }
  return raw;
}

/** Replace E.164 / raw phone tokens inside mixed dashboard copy. */
export function formatPhonesInText(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const withoutPlaceholderEmail = raw.replace(
    /(\+?\d[\d\s().+-]{6,}\d)@phone\.havena\.local/gi,
    (_, phone) => toDisplayPhone(phone) || phone,
  );
  return withoutPlaceholderEmail.replace(/\+?\d[\d\s().-]{6,}\d/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 10) return match;
    return toDisplayPhone(match) || match;
  });
}
