import api from "./client";

export type PayableType = "unit_service_bill" | "amenity_resident_bill" | "utility_bill";

export type PaymentTone = "success" | "pending" | "danger" | "muted";

export type OnlinePaymentSummary = {
  id: string;
  reference: string;
  status: "awaiting_payment" | "processing" | "succeeded" | "failed" | "cancelled" | "expired" | "refund_pending" | "refunded" | "reversed";
  status_label: string;
  amount: number;
  formatted_amount: string;
  method_label: string | null;
  confirmed_at: string | null;
  created_at: string | null;
};

export type OnlinePayment = {
  available: boolean;
  provider: "kuickpay" | "plaid" | null;
  test_mode?: boolean;
  active_payment?: OnlinePaymentSummary | null;
  last_payment?: OnlinePaymentSummary | null;
  voucher?: { consumer_number: string; display: string } | null;
};

export type PaymentDetail = OnlinePaymentSummary & {
  internal_status: string;
  message: string;
  tone: PaymentTone;
  payable_type: PayableType;
  payable_id: number;
  title: string;
  subtitle: string | null;
  amount_paisa: number;
  currency: string;
  method: string | null;
  channel: string;
  test_mode: boolean;
  is_final: boolean;
  can_resume: boolean;
  can_cancel: boolean;
  resume_url: string | null;
  expires_at: string | null;
  receipt: {
    reference: string;
    transaction_id: string | null;
    receipt_id: string | null;
    paid_at: string | null;
    paid_to: string | null;
    payer: string | null;
    method_label: string;
    channel_label: string;
  } | null;
  payer?: { id: number; name: string } | null;
  failure_message?: string | null;
  needs_attention?: boolean;
  provider_transaction_id?: string | null;
  events?: { event: string; status_from: string | null; status_to: string | null; actor_type: string; created_at: string | null }[];
};

export type PayResult = {
  outcome: "redirect" | "processing" | "already_paid";
  payment: PaymentDetail | null;
  next_action: { type: "redirect"; url: string; expires_at: string | null } | null;
  message: string | null;
};

export async function startKuickpayPayment(payableType: PayableType, payableId: number, expectedAmountPaisa?: number) {
  const { data } = await api.post<{ data: PayResult }>("/v1/payments", {
    payable_type: payableType,
    payable_id: payableId,
    channel: "web",
    ...(expectedAmountPaisa != null ? { expected_amount_paisa: expectedAmountPaisa } : {}),
  });
  return data.data;
}

export async function fetchKuickpayPayment(id: string, sync = false) {
  const { data } = await api.get<{ data: PaymentDetail }>(`/v1/payments/${id}`, { params: sync ? { sync: 1 } : {} });
  return data.data;
}

export async function cancelKuickpayPayment(id: string) {
  const { data } = await api.post<{ data: PaymentDetail }>(`/v1/payments/${id}/cancel`);
  return data.data;
}

export type AdminPaymentsSummary = {
  provider: string | null;
  enabled: boolean;
  test_mode: boolean;
  collected_this_month: number;
  collected_count_this_month: number;
  by_type: Record<string, { amount: number; count: number }>;
  processing: number;
  needs_attention: number;
  linked_utility_accounts: number;
  outstanding?: { count: number; amount: number };
  open_cases?: number;
  fees?: { resident_fee: number | null; community_fee: number | null; note: string };
  profile: {
    payments_enabled: boolean;
    utilities_enabled: boolean;
    residents_can_link_utilities: boolean;
    onboarding_status: string;
    settlement_account_title: string | null;
    settlement_bank: string | null;
    settlement_account_last4: string | null;
  };
};

export async function fetchAdminPaymentsSummary() {
  const { data } = await api.get<{ data: AdminPaymentsSummary }>("/v1/admin/payments/summary");
  return data.data;
}

export async function fetchAdminPayments(params: { status?: string; type?: string; search?: string; page?: number; from?: string; to?: string }) {
  const { data } = await api.get<{ data: PaymentDetail[]; meta: { current_page: number; last_page: number; total: number } }>(
    "/v1/admin/payments",
    { params },
  );
  return data;
}

export async function fetchAdminPayment(id: string) {
  const { data } = await api.get<{ data: PaymentDetail }>(`/v1/admin/payments/${id}`);
  return data.data;
}

export async function reconcileAdminPayment(id: string) {
  const { data } = await api.post<{ data: PaymentDetail; message: string }>(`/v1/admin/payments/${id}/reconcile`);
  return data;
}

export async function markAdminPaymentRefunded(id: string, note?: string) {
  const { data } = await api.post<{ data: PaymentDetail; message: string }>(`/v1/admin/payments/${id}/refunded`, { note });
  return data;
}

export async function downloadAdminPaymentsCsv(params: { status?: string; type?: string; search?: string; from?: string; to?: string }) {
  const response = await api.get("/v1/admin/payments/export", { params, responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kuickpay-payments.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export type OutstandingBills = {
  totals: { count: number; amount: number };
  bills: { type: string; id: number; title: string; amount: number; due_date: string | null; status: string; resident: string | null; unit: string | null }[];
};

export async function fetchOutstandingBills() {
  const { data } = await api.get<{ data: OutstandingBills }>("/v1/admin/payments/outstanding");
  return data.data;
}

export type PaymentCaseRow = {
  id: string;
  kind: string;
  kind_label: string;
  status: string;
  reason: string;
  details: string | null;
  amount: number;
  resolution_note: string | null;
  payment_id: string | null;
  payment_reference: string | null;
  resident: string | null;
  title: string | null;
  created_at: string | null;
};

export async function fetchPaymentCases(status: "open" | "closed" | "all" = "open") {
  const { data } = await api.get<{ data: PaymentCaseRow[] }>("/v1/admin/payments/cases", { params: { status } });
  return data.data;
}

export async function openAdminPaymentCase(paymentId: string, payload: { kind: "dispute" | "refund_request" | "reversal"; reason: string; details?: string }) {
  const { data } = await api.post<{ data: PaymentCaseRow }>(`/v1/admin/payments/${paymentId}/cases`, payload);
  return data.data;
}

export async function resolvePaymentCase(id: string, payload: { decision: "needs_information" | "rejected" | "recorded"; note?: string; reopen_bill?: boolean }) {
  const { data } = await api.post<{ data: PaymentCaseRow; message: string }>(`/v1/admin/payments/cases/${id}/resolve`, payload);
  return data;
}

export type KuickpayPlatformOverview = {
  mode: string;
  operational: boolean;
  checkout_status_api: "configured" | "not_published";
  method_selection: string;
  credentials: Record<string, boolean>;
  counts: { succeeded: number; processing: number; failed: number; needs_attention: number; open_cases: number };
  communities: { id: number; name: string; payments_enabled: boolean; utilities_enabled: boolean; rail: string | null }[];
  note: string;
};

export async function fetchKuickpayPlatformOverview() {
  const { data } = await api.get<{ data: KuickpayPlatformOverview }>("/v1/admin/kuickpay/overview");
  return data.data;
}

export type PlatformPaymentRow = {
  id: string;
  community: string | null;
  community_id: number;
  resident: string | null;
  title: string | null;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  needs_attention: boolean;
  transaction_id: string | null;
  created_at: string | null;
};

export async function fetchKuickpayPlatformPayments(params: { status?: string; page?: number }) {
  const { data } = await api.get<{ data: PlatformPaymentRow[]; meta: { current_page: number; last_page: number; total: number } }>(
    "/v1/admin/kuickpay/payments",
    { params },
  );
  return data;
}

export async function downloadKuickpayPlatformCsv(status?: string) {
  const response = await api.get("/v1/admin/kuickpay/payments/export", { params: { status }, responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kuickpay-platform.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export async function updateAdminPaymentSettings(payload: Partial<AdminPaymentsSummary["profile"]>) {
  const { data } = await api.patch<{ data: AdminPaymentsSummary["profile"]; message: string }>("/v1/admin/payments/settings", payload);
  return data;
}
