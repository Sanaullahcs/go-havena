import { getCountryCallingCode } from "libphonenumber-js/min";

export const DEFAULT_PHONE_COUNTRY = "US";

/** Curated list — US first, then alphabetical by name */
export const PHONE_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "BD", name: "Bangladesh" },
  { code: "BR", name: "Brazil" },
  { code: "CN", name: "China" },
  { code: "EG", name: "Egypt" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria" },
  { code: "PK", name: "Pakistan" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "QA", name: "Qatar" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
];

export function getCountryFlag(isoCode) {
  const code = String(isoCode ?? "").toUpperCase();
  if (code.length !== 2) return "";
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}

export function getDialCode(isoCode) {
  try {
    return getCountryCallingCode(isoCode);
  } catch {
    return "1";
  }
}

export function getCountryByCode(isoCode) {
  return PHONE_COUNTRIES.find((c) => c.code === isoCode) ?? PHONE_COUNTRIES[0];
}

export function formatDialLabel(isoCode) {
  return `+${getDialCode(isoCode)}`;
}

/** Representative national digits for placeholder formatting per country */
export const COUNTRY_PLACEHOLDER_DIGITS = {
  US: "2015550123",
  CA: "2045550123",
  GB: "7400123456",
  PK: "3001234567",
  IN: "9876543210",
  AU: "412345678",
  BD: "1712345678",
  BR: "11987654321",
  CN: "13123456789",
  EG: "1012345678",
  FR: "612345678",
  DE: "15123456789",
  ID: "8123456789",
  IE: "851234567",
  IT: "3123456789",
  JP: "9012345678",
  MY: "123456789",
  MX: "5512345678",
  NL: "612345678",
  NZ: "211234567",
  NG: "8021234567",
  PH: "9051234567",
  PL: "512345678",
  QA: "33123456",
  SA: "512345678",
  SG: "81234567",
  ZA: "711234567",
  KR: "1012345678",
  ES: "612345678",
  SE: "701234567",
  CH: "781234567",
  AE: "501234567",
};

export function getPlaceholderDigits(isoCode) {
  return COUNTRY_PLACEHOLDER_DIGITS[isoCode] ?? COUNTRY_PLACEHOLDER_DIGITS.US;
}
