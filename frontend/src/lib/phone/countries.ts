import { getCountryCallingCode } from "libphonenumber-js/min";

export const DEFAULT_PHONE_COUNTRY = "US";

export type PhoneCountry = {
  code: string;
  name: string;
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
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

export function getCountryByCode(isoCode: string): PhoneCountry {
  return PHONE_COUNTRIES.find((c) => c.code === isoCode) ?? PHONE_COUNTRIES[0];
}

export function formatDialLabel(isoCode: string): string {
  try {
    return `+${getCountryCallingCode(isoCode as never)}`;
  } catch {
    return "+1";
  }
}

export function getCountryFlag(isoCode: string): string {
  const code = String(isoCode ?? "").toUpperCase();
  if (code.length !== 2) return "";
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)));
}
