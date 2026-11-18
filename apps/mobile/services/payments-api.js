import { API_BASE_URL, isLocalDevApi } from "../constants/api-config";
import { apiRequest } from "./api-client";

/**
 * Production / UAT (HTTPS gohavena API): Pay Now + bills hub show "Coming soon".
 * Local dev (LAN / emulator API): full billing, unit bills in Services, finance notices flow.
 */
const PAYMENTS_LIVE_FOR_RESIDENTS = isLocalDevApi(API_BASE_URL);

/** Online checkout (KuickPay / card) — production off until launch. */
export const PAY_NOW_ENABLED = PAYMENTS_LIVE_FOR_RESIDENTS;

/** Bills hub, home quick action, and bill summaries — same environment split. */
export const PAY_BILLS_ENABLED = PAYMENTS_LIVE_FOR_RESIDENTS;

export function isResidentPaymentsComingSoon() {
  return !PAYMENTS_LIVE_FOR_RESIDENTS;
}

/** KuickPay (Pakistan) resident payments and utility bills. */

export const PAYABLE = {
  SERVICE_BILL: "unit_service_bill",
  AMENITY_BILL: "amenity_resident_bill",
  UTILITY_BILL: "utility_bill",
};

let capabilityCache = null;

export async function fetchPaymentCapability({ force = false } = {}) {
  if (!force && capabilityCache && Date.now() - capabilityCache.at < 60_000) {
    return capabilityCache.data;
  }
  const res = await apiRequest("/payments/capability", { cache: "no-store" });
  const data = res?.data ?? { provider: null, kuickpay: { enabled: false } };
  capabilityCache = { at: Date.now(), data };
  return data;
}

export function clearPaymentCapabilityCache() {
  capabilityCache = null;
}

/** Pay Now. Resolves to { outcome: "redirect" | "processing" | "already_paid", payment, next_action }. */
export async function startPayment({ payableType, payableId, appReturnUrl, expectedAmountPaisa }) {
  const res = await apiRequest("/payments", {
    method: "POST",
    body: {
      payable_type: payableType,
      payable_id: payableId,
      channel: "mobile",
      app_return_url: appReturnUrl,
      ...(expectedAmountPaisa != null ? { expected_amount_paisa: expectedAmountPaisa } : {}),
    },
  });
  return res?.data;
}

export async function fetchPayment(id, { sync = false } = {}) {
  const res = await apiRequest(`/payments/${id}${sync ? "?sync=1" : ""}`, { cache: "no-store" });
  return res?.data;
}

export async function cancelPayment(id) {
  const res = await apiRequest(`/payments/${id}/cancel`, { method: "POST" });
  return res?.data;
}

/** Opens a dispute or refund record. Does not move money. kind is dispute or refund_request. */
export async function openPaymentCase(id, { kind, reason, details }) {
  const res = await apiRequest(`/payments/${id}/cases`, {
    method: "POST",
    body: { kind, reason, details: details || null },
  });
  return res?.data;
}

export async function fetchPayments({ status = "all", page = 1 } = {}) {
  const res = await apiRequest(`/payments?status=${encodeURIComponent(status)}&page=${page}`, { cache: "no-store" });
  return { items: res?.data ?? [], meta: res?.meta ?? {} };
}

export async function fetchUtilityBillers(serviceType) {
  const query = serviceType ? `?service_type=${encodeURIComponent(serviceType)}` : "";
  const res = await apiRequest(`/utilities/billers${query}`);
  return res?.data ?? [];
}

export async function fetchUtilityAccounts() {
  const res = await apiRequest("/utilities/accounts", { cache: "no-store" });
  return { accounts: res?.data ?? [], meta: res?.meta ?? {} };
}

export async function linkUtilityAccount({ billerId, reference, nickname }) {
  const res = await apiRequest("/utilities/accounts", {
    method: "POST",
    body: { utility_biller_id: billerId, reference, nickname: nickname || null },
    timeoutMs: 40000,
  });
  return res?.data;
}

export async function refreshUtilityAccount(id) {
  const res = await apiRequest(`/utilities/accounts/${id}/refresh`, { method: "POST", timeoutMs: 40000 });
  return res?.data;
}

export async function renameUtilityAccount(id, nickname) {
  const res = await apiRequest(`/utilities/accounts/${id}`, { method: "PATCH", body: { nickname: nickname || null } });
  return res?.data;
}

export async function removeUtilityAccount(id) {
  return apiRequest(`/utilities/accounts/${id}`, { method: "DELETE" });
}
