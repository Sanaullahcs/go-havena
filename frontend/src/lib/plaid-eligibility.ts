import { getUser, isPakistanCommunityRegion, type WebUser } from "@/lib/auth/session";

/**
 * Single frontend check for Plaid bank linking.
 * Prefers the backend `plaid_available` flag; falls back to country / billing-exempt.
 */
export function isPlaidAvailable(user?: WebUser | null): boolean {
  const current = user ?? getUser();
  const flagged = current?.access?.plaid_available;
  if (typeof flagged === "boolean") {
    return flagged;
  }

  if (current?.access?.billing_exempt) {
    return false;
  }

  return !isPakistanCommunityRegion(current);
}
