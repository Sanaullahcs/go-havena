import type { AchCapability } from "@/lib/api/resident-plaid";

/** What a paid amenity booking must do before it can be saved. */
export type PaidBookingPlaidStep = "none" | "link" | "charge" | "community_bank" | "proof";

export function paidBookingPlaidStep(
  fee: number,
  capability: AchCapability | null | undefined,
): PaidBookingPlaidStep {
  if (fee <= 0) return "none";
  const plaidOn = Boolean(capability?.plaid_available && capability?.ach_enabled);
  if (!plaidOn) return "proof";
  if (!capability?.resident?.connected) return "link";
  if (!capability?.community?.bank_connected) return "community_bank";
  return "charge";
}

export const COMMUNITY_BANK_MISSING_MESSAGE =
  "Your bank is connected, but this community has not connected a receiving account on Plaid yet. The reservation was not booked.";
