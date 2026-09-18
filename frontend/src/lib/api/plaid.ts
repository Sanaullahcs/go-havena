import api from "./client";

export type PlaidConnectionStatus =
  | "not_connected"
  | "connected"
  | "disconnected"
  | "error"
  | "needs_attention";

export interface PlaidLinkTokenPayload {
  link_token: string;
  expiration: string;
  mode?: "create" | "update";
}

export interface PlaidAccountPayload {
  name?: string | null;
  official_name?: string | null;
  type?: string | null;
  subtype?: string | null;
  mask?: string | null;
}

export interface PlaidExchangePayload {
  connected: boolean;
  status?: PlaidConnectionStatus;
  needs_reconnect?: boolean;
  item_id?: string | null;
  institution_name?: string | null;
  institution_id?: string | null;
  account?: PlaidAccountPayload | null;
  error_code?: string | null;
  error_message?: string | null;
  last_webhook_code?: string | null;
  last_webhook_at?: string | null;
  connected_at?: string | null;
  disconnected_at?: string | null;
  environment?: string | null;
  plaid_available?: boolean;
}

export interface PlaidExchangeInput {
  public_token: string;
  account_id?: string | null;
  account?: {
    name?: string | null;
    official_name?: string | null;
    type?: string | null;
    subtype?: string | null;
    mask?: string | null;
  };
  institution_id?: string | null;
  institution_name?: string | null;
  replace?: boolean;
}

export async function fetchPlaidConnection(): Promise<PlaidExchangePayload> {
  const res = await api.get<{ success: boolean; data: PlaidExchangePayload }>(
    "/v1/plaid/connection",
  );
  return res.data.data;
}

export async function createPlaidLinkToken(
  mode: "create" | "update" | "replace" = "create",
): Promise<PlaidLinkTokenPayload> {
  const res = await api.post<{ success: boolean; data: PlaidLinkTokenPayload }>(
    "/v1/plaid/link-token",
    { mode },
  );
  return res.data.data;
}

export async function exchangePlaidPublicToken(
  publicToken: string,
  extras: Omit<PlaidExchangeInput, "public_token"> = {},
): Promise<PlaidExchangePayload> {
  const res = await api.post<{ success: boolean; data: PlaidExchangePayload }>(
    "/v1/plaid/exchange-token",
    { public_token: publicToken, ...extras },
  );
  return res.data.data;
}

export async function reconnectPlaidConnection(): Promise<PlaidExchangePayload> {
  const res = await api.post<{ success: boolean; data: PlaidExchangePayload }>(
    "/v1/plaid/reconnect",
  );
  return res.data.data;
}

export async function disconnectPlaidConnection(): Promise<PlaidExchangePayload> {
  const res = await api.post<{ success: boolean; data: PlaidExchangePayload }>(
    "/v1/plaid/disconnect",
  );
  return res.data.data;
}
