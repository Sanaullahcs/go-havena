import api from "./client";
import type { PlaidAccountPayload, PlaidExchangeInput, PlaidExchangePayload, PlaidLinkTokenPayload } from "./plaid";

export type AchCapability = {
  plaid_available: boolean;
  ach_enabled: boolean;
  can_pay_with_bank: boolean;
  requires_resident_link: boolean;
  fallback_proof: boolean;
  environment?: string | null;
  transfer_mode?: "live" | "simulated" | string | null;
  live_transfer_ready?: boolean;
  community: {
    id: number;
    name?: string | null;
    bank_connected: boolean;
    institution_name?: string | null;
    account_mask?: string | null;
    needs_reconnect?: boolean;
  };
  resident: PlaidExchangePayload;
};

export type PlaidPayment = {
  id: string;
  purpose: string;
  purpose_label: string;
  amount: number;
  currency: string;
  status: string;
  status_label: string;
  simulated?: boolean;
  description?: string | null;
  source?: { institution_name?: string | null; mask?: string | null };
  destination?: { institution_name?: string | null; mask?: string | null };
  payable_type?: string | null;
  payable_id?: number | null;
  failure_message?: string | null;
  posted_at?: string | null;
  created_at?: string | null;
  user_name?: string | null;
};

export async function fetchAchCapability(): Promise<AchCapability> {
  const res = await api.get<{ success: boolean; data: AchCapability }>("/v1/plaid/resident/capability");
  return res.data.data;
}

export async function fetchResidentPlaidConnection(): Promise<PlaidExchangePayload> {
  const res = await api.get<{ success: boolean; data: PlaidExchangePayload }>("/v1/plaid/resident/connection");
  return res.data.data;
}

export async function createResidentPlaidLinkToken(
  mode: "create" | "update" | "replace" = "create",
): Promise<PlaidLinkTokenPayload> {
  const res = await api.post<{ success: boolean; data: PlaidLinkTokenPayload }>(
    "/v1/plaid/resident/link-token",
    { mode },
  );
  return res.data.data;
}

export async function exchangeResidentPlaidToken(
  publicToken: string,
  extras: Omit<PlaidExchangeInput, "public_token"> = {},
): Promise<PlaidExchangePayload> {
  const res = await api.post<{ success: boolean; data: PlaidExchangePayload }>(
    "/v1/plaid/resident/exchange-token",
    { public_token: publicToken, ...extras },
  );
  return res.data.data;
}

export async function reconnectResidentPlaid(): Promise<PlaidExchangePayload> {
  const res = await api.post<{ success: boolean; data: PlaidExchangePayload }>("/v1/plaid/resident/reconnect");
  return res.data.data;
}

export async function disconnectResidentPlaid(): Promise<PlaidExchangePayload> {
  const res = await api.post<{ success: boolean; data: PlaidExchangePayload }>("/v1/plaid/resident/disconnect");
  return res.data.data;
}

export async function fetchResidentPayments(): Promise<PlaidPayment[]> {
  const res = await api.get<{ success: boolean; data: PlaidPayment[] }>("/v1/plaid/resident/payments");
  return res.data.data;
}

export async function paySharedBillWithBank(amenityId: number, residentBillId: number) {
  const res = await api.post(`/v1/amenities/${amenityId}/bills/${residentBillId}/pay-bank`);
  return res.data;
}

export async function fetchAdminPlaidPayments(): Promise<PlaidPayment[]> {
  const res = await api.get<{ success: boolean; data: PlaidPayment[] }>("/v1/plaid/payments");
  return res.data.data;
}

export function bankAccountLabel(account?: PlaidAccountPayload | null, institution?: string | null) {
  const name = account?.name || account?.official_name || institution || "Bank account";
  const mask = account?.mask ? `•••• ${account.mask}` : null;
  return mask ? `${name} ${mask}` : name;
}
