/**
 * Money display for community amounts (amenity fees, bills, listings, services).
 *
 * Amounts are stored as plain decimals in the community's own currency — there
 * is no conversion anywhere. This module only decides how to render them, so a
 * Lahore community reads "Rs 18,000" while a Boston one reads "$1,250".
 *
 * Mirrors `backend/app/Support/Currency.php` and `frontend/src/lib/money.ts`;
 * keep the three tables in sync.
 */

import { useEffect, useState } from "react";

import { getCachedUser, subscribeSessionUser } from "../services/auth-session";

export const DEFAULT_CURRENCY = "USD";

const DISPLAY = {
  USD: { symbol: "$", decimals: 2 },
  PKR: { symbol: "Rs", decimals: 0 },
  INR: { symbol: "₹", decimals: 0 },
  BDT: { symbol: "৳", decimals: 0 },
  LKR: { symbol: "Rs", decimals: 0 },
  AED: { symbol: "AED", decimals: 2 },
  SAR: { symbol: "SAR", decimals: 2 },
  QAR: { symbol: "QAR", decimals: 2 },
  KWD: { symbol: "KWD", decimals: 3 },
  BHD: { symbol: "BHD", decimals: 3 },
  OMR: { symbol: "OMR", decimals: 3 },
  GBP: { symbol: "£", decimals: 2 },
  EUR: { symbol: "€", decimals: 2 },
  CAD: { symbol: "C$", decimals: 2 },
  AUD: { symbol: "A$", decimals: 2 },
  NZD: { symbol: "NZ$", decimals: 2 },
  SGD: { symbol: "S$", decimals: 2 },
  MYR: { symbol: "RM", decimals: 2 },
  IDR: { symbol: "Rp", decimals: 0 },
  PHP: { symbol: "₱", decimals: 2 },
  TRY: { symbol: "₺", decimals: 2 },
  EGP: { symbol: "E£", decimals: 2 },
  ZAR: { symbol: "R", decimals: 2 },
  NGN: { symbol: "₦", decimals: 0 },
  KES: { symbol: "KSh", decimals: 0 },
  MXN: { symbol: "MX$", decimals: 2 },
  BRL: { symbol: "R$", decimals: 2 },
  JPY: { symbol: "¥", decimals: 0 },
  CNY: { symbol: "¥", decimals: 2 },
  HKD: { symbol: "HK$", decimals: 2 },
  CHF: { symbol: "CHF", decimals: 2 },
};

export function normalizeCurrency(code) {
  const upper = String(code ?? "").trim().toUpperCase();
  return DISPLAY[upper] ? upper : DEFAULT_CURRENCY;
}

export function currencySymbol(code) {
  return DISPLAY[normalizeCurrency(code)].symbol;
}

/** Currency of the community the signed-in user is acting in. */
export function getActiveCurrency(user) {
  const u = user ?? getCachedUser();
  const fromMembership = (u?.memberships ?? []).find(
    (m) => Number(m.community_id) === Number(u?.active_context_community_id),
  )?.community?.currency;

  return normalizeCurrency(u?.currency ?? u?.access?.currency ?? fromMembership);
}

/**
 * "Rs 18,000" / "$1,250.50". Trailing zeros are dropped so a round amount reads
 * as "$75", and letter symbols get a space so "Rs18,000" never happens.
 */
export function formatMoney(value, currency) {
  const code = normalizeCurrency(currency);
  const { symbol } = DISPLAY[code];
  const gap = /[A-Za-z]$/.test(symbol) ? " " : "";
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) return `${symbol}${gap}0`;

  const decimals =
    DISPLAY[code].decimals > 0 && Math.abs(amount - Math.round(amount)) < 0.00001
      ? 0
      : DISPLAY[code].decimals;

  return `${symbol}${gap}${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Formats using the signed-in user's community currency. */
export function formatCommunityMoney(value) {
  return formatMoney(value, getActiveCurrency());
}

/**
 * Currency of the active community, kept in sync with session changes so the
 * symbol is correct right after login or a mode switch.
 */
export function useCurrency() {
  const [currency, setCurrency] = useState(() => getActiveCurrency());

  useEffect(() => subscribeSessionUser((user) => setCurrency(getActiveCurrency(user))), []);

  return currency;
}
