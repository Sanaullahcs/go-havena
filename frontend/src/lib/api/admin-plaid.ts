import api from "./client";

export interface AdminPlaidConfig {
  environment: string;
  app_environment: string;
  configured: boolean;
  client_id_set: boolean;
  secret_set: boolean;
  transfers_enabled: boolean;
  simulated: boolean;
  sandbox_blocked_in_production: boolean;
  webhook_url_set: boolean;
  verify_webhooks: boolean;
  supported_country_codes: string[];
}

export interface AdminPlaidHealth {
  last_webhook_received_at: string | null;
  last_webhook_processed_at: string | null;
  last_webhook_failed_at: string | null;
  last_event_sync_at: string | null;
  event_cursor: number;
  unmatched_events: number;
}

export interface AdminPlaidCounts {
  pending: number;
  stale: number;
  failed_30d: number;
  returned_30d: number;
  refunds_pending: number;
  open_exceptions: number;
}

export interface AdminPlaidCommunity {
  id: number;
  name: string;
  status: string | null;
  country_code: string | null;
  eligible: boolean;
  bank: {
    connected: boolean;
    status: string;
    needs_reconnect: boolean;
    institution_name: string | null;
    account_mask: string | null;
    error_code: string | null;
  };
  payments_paused: boolean;
  payments_pause_reason: string | null;
  payments_paused_at: string | null;
  ready: boolean;
  readiness_reason: string;
  readiness_message: string;
  open_payments: number;
}

export interface AdminPlaidOverview {
  config: AdminPlaidConfig;
  health: AdminPlaidHealth;
  counts: AdminPlaidCounts;
  communities: AdminPlaidCommunity[];
}

export interface AdminPlaidTransfer {
  id: string;
  purpose_label: string;
  amount: number;
  currency: string;
  status: string;
  status_label: string;
  refund_status: string | null;
  return_code: string | null;
  simulated: boolean;
  user_name: string | null;
  community_id: number;
  community_name: string | null;
  debit_transfer_id: string | null;
  credit_transfer_id: string | null;
  refund_transfer_id: string | null;
  credit_status: string | null;
  exception_code: string | null;
  exception_message: string | null;
  exception_open: boolean;
  failure_message: string | null;
  source: { institution_name: string | null; mask: string | null };
  destination: { institution_name: string | null; mask: string | null };
  created_at: string | null;
  last_synced_at: string | null;
}

export type AdminPlaidStatusFilter =
  | "all"
  | "pending"
  | "paid"
  | "failed"
  | "returned"
  | "cancelled"
  | "refunds"
  | "exceptions"
  | "stale";

export async function fetchAdminPlaidOverview(): Promise<AdminPlaidOverview> {
  const res = await api.get<{ data: AdminPlaidOverview }>("/v1/admin/plaid/overview");
  return res.data.data;
}

export async function fetchAdminPlaidTransfers(params: {
  status?: AdminPlaidStatusFilter;
  community_id?: number | null;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
}): Promise<{ data: AdminPlaidTransfer[]; meta: { current_page: number; last_page: number; total: number } }> {
  const query: Record<string, string | number> = {};
  if (params.status && params.status !== "all") query.status = params.status;
  if (params.community_id) query.community_id = params.community_id;
  if (params.search) query.search = params.search;
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.page) query.page = params.page;
  const res = await api.get("/v1/admin/plaid/transfers", { params: query });
  return res.data;
}

export async function refreshAdminPlaidTransfer(id: string): Promise<{ data: AdminPlaidTransfer; message: string }> {
  const res = await api.post(`/v1/admin/plaid/transfers/${id}/refresh`);
  return res.data;
}

export async function resolveAdminPlaidException(id: string, note: string): Promise<{ data: AdminPlaidTransfer; message: string }> {
  const res = await api.post(`/v1/admin/plaid/transfers/${id}/resolve-exception`, { note });
  return res.data;
}

export async function syncAdminPlaidEvents(): Promise<{ message: string }> {
  const res = await api.post("/v1/admin/plaid/sync-events");
  return res.data;
}

export async function setCommunityBankPayments(communityId: number, enabled: boolean, reason: string): Promise<{ message: string }> {
  const res = await api.patch(`/v1/admin/plaid/communities/${communityId}/payments`, { enabled, reason });
  return res.data;
}
