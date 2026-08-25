import api from "./client";

export interface PlaidLinkTokenPayload {
  link_token: string;
  expiration: string;
}

export async function createPlaidLinkToken(): Promise<PlaidLinkTokenPayload> {
  const res = await api.post<{ success: boolean; data: PlaidLinkTokenPayload }>(
    "/v1/plaid/link-token",
  );
  return res.data.data;
}
