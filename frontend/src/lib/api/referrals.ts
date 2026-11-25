import api from "./client";

export type ReferralRewardType = "percent" | "fixed";

export interface ReferralAttributionRow {
  id: number;
  status: string;
  display_status?:
    | "rewarded"
    | "disqualified"
    | "payout_failed"
    | "payout_pending"
    | "awaiting_payment"
    | "signed_up";
  reward_type?: ReferralRewardType;
  reward_percent: number;
  reward_fixed_cents?: number | null;
  reward_label?: string;
  referral_code?: string | null;
  referrer: { id: number; name?: string | null; phone?: string | null };
  referee: { id: number; name?: string | null; phone?: string | null };
  referee_community?: { id: number; name: string } | null;
  reward?: {
    id: number;
    amount_cents: number;
    invoice_subtotal_cents: number;
    status: string;
    credited_at?: string | null;
  } | null;
  fraud_flags: string[];
  fraud_review_status: string;
  locked_at?: string | null;
  disqualified_at?: string | null;
  disqualify_reason?: string | null;
}

export interface ReferralDashboard {
  program_active: boolean;
  reward_type?: ReferralRewardType;
  reward_percent: number;
  reward_fixed_cents?: number | null;
  reward_label?: string;
  referral_code: string | null;
  referral_link: string | null;
  stats: {
    total_referrals: number;
    pending_referrals: number;
    successful_referrals: number;
    disqualified_referrals: number;
    total_credit_earned_cents: number;
  };
  history: ReferralAttributionRow[];
}

export interface ReferralProgramSettings {
  reward_type: ReferralRewardType;
  reward_percent: number;
  reward_fixed_cents: number | null;
  is_active: boolean;
  updated_at?: string | null;
}

export interface ReferralAttributionListResponse {
  data: ReferralAttributionRow[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    overview: {
      total_attributions: number;
      pending_qualification: number;
      qualified: number;
      disqualified: number;
      flagged_for_review: number;
      total_credit_earned_cents: number;
    };
  };
}

export function formatReferralRewardLabel(
  row: Pick<ReferralAttributionRow, "reward_type" | "reward_percent" | "reward_fixed_cents" | "reward_label">,
): string {
  if (row.reward_label) return row.reward_label;
  if (row.reward_type === "fixed" && row.reward_fixed_cents) {
    return `$${(row.reward_fixed_cents / 100).toFixed(2)}`;
  }
  return `${row.reward_percent ?? 0}%`;
}

export async function fetchMyReferralDashboard(): Promise<ReferralDashboard> {
  const res = await api.get("/v1/admin/referrals/me");
  return res.data.data as ReferralDashboard;
}

export async function fetchReferralProgramSettings(): Promise<ReferralProgramSettings> {
  const res = await api.get("/v1/admin/referral-program/settings");
  return res.data.data as ReferralProgramSettings;
}

export async function updateReferralProgramSettings(data: {
  reward_type: ReferralRewardType;
  reward_percent?: number;
  reward_fixed_cents?: number;
  is_active: boolean;
}): Promise<ReferralProgramSettings> {
  const res = await api.put("/v1/admin/referral-program/settings", data);
  return res.data.data as ReferralProgramSettings;
}

export async function fetchReferralAttributions(
  params?: Record<string, unknown>,
): Promise<ReferralAttributionListResponse> {
  const res = await api.get("/v1/admin/referral-program/attributions", { params });
  return res.data as ReferralAttributionListResponse;
}

export async function reviewReferralAttribution(
  id: number,
  decision: "approve" | "reject",
): Promise<ReferralAttributionRow> {
  const res = await api.post(`/v1/admin/referral-program/attributions/${id}/review`, { decision });
  return res.data.data as ReferralAttributionRow;
}

export async function retryReferralReward(id: number): Promise<{ status: string }> {
  const res = await api.post(`/v1/admin/referral-program/rewards/${id}/retry`);
  return res.data.data as { status: string };
}
