import { getCachedUser } from "../services/auth-session";

/** "kuickpay" for Pakistan communities, "plaid" for the US, null when neither applies. */
export function activePaymentProvider(user) {
  const u = user ?? getCachedUser();
  const memberships = u?.memberships ?? [];
  const active =
    memberships.find((m) => Number(m.community_id) === Number(u?.active_context_community_id)) ??
    memberships.find((m) => m.status === "approved") ??
    memberships[0];

  return active?.community?.payment_provider ?? null;
}

export function usesKuickpay(user) {
  return activePaymentProvider(user) === "kuickpay";
}
