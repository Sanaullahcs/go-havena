import { apiRequest } from "./api-client";

export async function fetchAdminBilling() {
  const res = await apiRequest("/admin/billing");
  return res?.data ?? res;
}

export function formatBillingMoney(cents, currency = "usd") {
  const amount = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency || "usd").toUpperCase(),
      currencyDisplay: "narrowSymbol",
    }).format(amount).replace(/^US\s?/, "");
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function formatBillingDate(value, locale = "en-US") {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
