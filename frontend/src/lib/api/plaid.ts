import api from "./client";

export interface PlaidLinkTokenPayload {
  link_token: string;
  expiration: string;
}

export interface PlaidExchangePayload {
  connected: boolean;
  item_id: string;
  institution_name: string | null;
  institution_id?: string | null;
}

export async function createPlaidLinkToken(): Promise<PlaidLinkTokenPayload> {
  const res = await api.post<{ success: boolean; data: PlaidLinkTokenPayload }>(
    "/v1/plaid/link-token",
  );
  return res.data.data;
}

export async function exchangePlaidPublicToken(
  publicToken: string,
): Promise<PlaidExchangePayload> {
  const res = await api.post<{ success: boolean; data: PlaidExchangePayload }>(
    "/v1/plaid/exchange-token",
    { public_token: publicToken },
  );
  return res.data.data;
}
