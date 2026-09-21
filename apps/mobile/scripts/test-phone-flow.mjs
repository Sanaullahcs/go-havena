/**
 * Run: node scripts/test-phone-flow.mjs
 * Validates all country codes, formatting, typing flow, and clamp logic.
 */
import {
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  getCountryCallingCode,
  validatePhoneNumberLength,
  AsYouType,
  formatIncompletePhoneNumber,
} from "libphonenumber-js/min";
import metadata from "libphonenumber-js/min/metadata";
import { Metadata } from "libphonenumber-js/min";
import { COUNTRY_PLACEHOLDER_DIGITS } from "../constants/phone-countries.js";

const PHONE_COUNTRIES = Object.keys(COUNTRY_PLACEHOLDER_DIGITS);
const metadataReader = new Metadata(metadata);
const NANP = new Set(["US", "CA"]);

function getDialCode(c) {
  return getCountryCallingCode(c);
}

function parseFor(d, c) {
  const dial = getDialCode(c);
  return parsePhoneNumberFromString(d, c) || parsePhoneNumberFromString(`+${dial}${d}`, c);
}

function getMaxNationalLength(country) {
  metadataReader.selectNumberingPlan(country);
  const lengths = metadataReader.numberingPlan.possibleLengths();
  return lengths.length ? Math.max(...lengths) : 15;
}

function looksLikeNANP(d) {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d);
}

function hasUsDisplayFormat(d) {
  return /^\(\d{3}\) \d{3}-\d{4}$/.test(new AsYouType("US").input(d));
}

function isUsFictionalNumber(digits) {
  return looksLikeNANP(digits) && digits.slice(0, 3) === "555";
}

function getCountryMismatchError(digits, selectedCountry) {
  if (!digits) return null;
  const validForSelected = isValidPhoneNumber(digits, selectedCountry);
  const validUs = isValidPhoneNumber(digits, "US");
  const validGb = isValidPhoneNumber(digits, "GB");

  if (!NANP.has(selectedCountry) && isUsFictionalNumber(digits)) {
    return "US fictional";
  }
  if (validForSelected) return null;

  if (!NANP.has(selectedCountry) && validUs) return "US mismatch";
  if (!NANP.has(selectedCountry) && hasUsDisplayFormat(digits) && looksLikeNANP(digits)) {
    return "US format";
  }
  if (selectedCountry !== "GB" && validGb) return "GB mismatch";
  if (selectedCountry !== "GB" && /^7\d{9}$/.test(digits) && validGb) return "UK mobile";
  return null;
}

function isValidPhone(digits, country) {
  if (!digits) return false;
  if (!isValidPhoneNumber(digits, country)) return false;
  if (getCountryMismatchError(digits, country)) return false;
  return true;
}

function clampNationalDigits(digits, country) {
  const raw = String(digits ?? "").replace(/\D/g, "");
  if (!raw) return "";
  let lastGood = "";
  for (const char of raw) {
    const candidate = lastGood + char;
    const typer = new AsYouType(country);
    typer.input(candidate);
    const national = typer.getNationalNumber();
    if (!national) continue;
    if (validatePhoneNumberLength(national, country) === "TOO_LONG") break;
    if (national.length > getMaxNationalLength(country)) break;
    lastGood = national;
  }
  return lastGood;
}

function extractNationalDigits(input, country) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  const typer = new AsYouType(country);
  typer.input(raw);
  const national = typer.getNationalNumber();
  if (national) return clampNationalDigits(national, country);
  let digits = raw.replace(/\D/g, "");
  const dial = getDialCode(country);
  if (digits.startsWith(dial) && digits.length > dial.length) digits = digits.slice(dial.length);
  return clampNationalDigits(digits, country);
}

function formatNationalDisplay(digits, country) {
  if (!digits) return "";
  const parsed = parseFor(digits, country);
  if (parsed?.isValid()) return parsed.formatNational();
  const incomplete = formatIncompletePhoneNumber(digits, country);
  if (incomplete && incomplete !== digits) return incomplete;
  return new AsYouType(country).input(digits);
}

function parsePhoneInputChange(text, country, previousDigits = "") {
  const cleaned = String(text ?? "");
  if (!cleaned.trim()) return "";

  const prev = String(previousDigits ?? "");
  const prevDisplay = formatNationalDisplay(prev, country);
  const rawDigits = cleaned.replace(/\D/g, "");

  if (prev) {
    if (rawDigits.length < prev.length) {
      return clampNationalDigits(rawDigits, country);
    }
    if (cleaned.length < prevDisplay.length && rawDigits.length >= prev.length) {
      return prev.slice(0, -1);
    }
  }

  return extractNationalDigits(cleaned, country);
}

function simulateDeletion(fullDigits, country) {
  let stored = fullDigits;
  while (stored.length > 0) {
    const display = formatNationalDisplay(stored, country);
    const shorter = display.slice(0, -1);
    const prev = stored;
    stored = parsePhoneInputChange(shorter, country, prev);
    if (stored.length >= prev.length) {
      return { ok: false, stuckAt: prev, display, shorter };
    }
  }
  return { ok: true };
}

function simulateTypingWithChange(fullDigits, country) {
  let stored = "";
  for (const ch of fullDigits) {
    const display = formatNationalDisplay(stored, country);
    stored = parsePhoneInputChange(display + ch, country, stored);
  }
  return {
    stored,
    valid: isValidPhone(stored, country),
    formatted: formatNationalDisplay(stored, country),
  };
}

const issues = [];

console.log("=== ALL COUNTRIES ===");
for (const code of PHONE_COUNTRIES) {
  const digits = COUNTRY_PLACEHOLDER_DIGITS[code];
  const typed = simulateTypingWithChange(digits, code);
  const ok = typed.valid && typed.stored === digits && typed.formatted !== digits;

  if (!typed.valid) issues.push({ code, problem: "invalid after typing", digits, stored: typed.stored });
  if (typed.stored !== digits) issues.push({ code, problem: "clamp truncated", expected: digits, got: typed.stored });
  if (typed.formatted === digits) issues.push({ code, problem: "no formatting", digits });

  console.log(code, ok ? "PASS" : "FAIL", "|", typed.formatted, "| valid:", typed.valid);
}

console.log("\n=== SPOT CHECKS ===");
const spots = [
  ["PK", "3001234567", true],
  ["PK", "03001234567", true],
  ["GB", "7400123456", true],
  ["GB", "5555555555", false],
  ["US", "2015550123", true],
  ["US", "2125551234", true],
  ["BR", "11987654321", true],
  ["DE", "15123456789", true],
  ["JP", "9012345678", true],
];
for (const [c, d, expect] of spots) {
  const typed = simulateTypingWithChange(d, c);
  const got = isValidPhone(typed.stored, c);
  const pass = got === expect;
  console.log(pass ? "PASS" : "FAIL", c, d, "expected", expect, "got", got);
  if (!pass) issues.push({ code: c, digits: d, expected: expect, got });
}

console.log("\n=== BACKSPACE / DELETE ===");
for (const code of ["US", "GB", "PK", "DE", "BR"]) {
  const digits = COUNTRY_PLACEHOLDER_DIGITS[code];
  const result = simulateDeletion(digits, code);
  console.log(code, result.ok ? "PASS" : "FAIL", result.ok ? "" : JSON.stringify(result));
  if (!result.ok) issues.push({ code, problem: "delete stuck", ...result });
}

console.log("\n=== SUMMARY ===");
if (issues.length === 0) {
  console.log("All tests passed.");
} else {
  console.log(issues.length, "issue(s):");
  console.log(JSON.stringify(issues, null, 2));
  process.exit(1);
}
