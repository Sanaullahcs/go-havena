"use client";

import { useEffect, useState } from "react";

import { getUser, type WebUser } from "@/lib/auth/session";

/**
 * Money display for community amounts (amenity fees, bills, listings, services).
 *
 * Amounts are stored as plain decimals in the community's own currency — there
 * is no conversion anywhere. This module only decides how to render them, so
 * a Lahore community reads "Rs 18,000" while a Boston one reads "$1,250".
 *
 * Mirrors `backend/app/Support/Currency.php`; keep the two tables in sync.
 */

export const DEFAULT_CURRENCY = "USD";

type CurrencyDisplay = { symbol: string; decimals: number };

const DISPLAY: Record<string, CurrencyDisplay> = {
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

export function normalizeCurrency(code?: string | null): string {
  const upper = String(code ?? "").trim().toUpperCase();
  return upper in DISPLAY ? upper : DEFAULT_CURRENCY;
}

export function currencySymbol(code?: string | null): string {
  return DISPLAY[normalizeCurrency(code)].symbol;
}

/** Currency of the community the signed-in user is acting in. */
export function getActiveCurrency(user?: WebUser | null): string {
  const u = user ?? getUser();
  const fromMembership = (u?.memberships ?? []).find(
    (m) => m.community_id === u?.access?.community_id,
  )?.community?.currency;

  return normalizeCurrency(u?.currency ?? u?.access?.currency ?? fromMembership);
}

/**
 * "Rs 18,000" / "$1,250.50". Trailing zeros are dropped so a round amount reads
 * as "$75", and letter symbols get a space so "Rs18,000" never happens.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
): string {
  const value = Number(amount ?? 0);
  const code = normalizeCurrency(currency);
  const { symbol } = DISPLAY[code];
  let decimals = DISPLAY[code].decimals;

  if (!Number.isFinite(value)) return `${symbol}${/[A-Za-z]$/.test(symbol) ? " " : ""}0`;
  if (decimals > 0 && Math.abs(value - Math.round(value)) < 0.00001) decimals = 0;

  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${symbol}${/[A-Za-z]$/.test(symbol) ? " " : ""}${formatted}`;
}

/** Formats using the signed-in user's community currency. */
export function formatCommunityMoney(
  amount: number | string | null | undefined,
  user?: WebUser | null,
): string {
  return formatMoney(amount, getActiveCurrency(user));
}

/**
 * Currency of the active community, kept in sync with session changes so the
 * symbol is correct right after login or a mode switch.
 */
export function useCurrency(): string {
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  useEffect(() => {
    const sync = () => setCurrency(getActiveCurrency());
    sync();
    window.addEventListener("nbr-session-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("nbr-session-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return currency;
}

/** `format` bound to the active community currency, for render-heavy screens. */
export function useMoneyFormatter(): (amount: number | string | null | undefined) => string {
  const currency = useCurrency();
  return (amount) => formatMoney(amount, currency);
}
