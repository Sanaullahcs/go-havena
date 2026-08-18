import { apiRequest } from "./api-client";

export function formatReferralRewardLabel(row = {}) {
  if (row.reward_label) return row.reward_label;
  if (row.reward_type === "fixed" && row.reward_fixed_cents) {
    return `$${(row.reward_fixed_cents / 100).toFixed(2)}`;
  }
  return `${row.reward_percent ?? 0}%`;
}

export function formatReferralMoney(cents, currency = "usd") {
  const amount = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency).toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export async function fetchMyReferralDashboard() {
  const res = await apiRequest("/admin/referrals/me");
  return res?.data ?? res;
}
