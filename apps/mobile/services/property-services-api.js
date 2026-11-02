import { API_BASE_URL } from "../constants/api-config";
import { apiRequest, ApiError } from "./api-client";
import { getCommunityId, getToken, getUser } from "./auth-session";
import { persistUploadAsset, uploadMultipartFile } from "../utils/upload-form-data";
import i18n from "../i18n";
import { buildPaymentRejectionBody } from "../constants/payment-rejection";

const SERVICE_CATEGORY_KEYS = [
  "electricity",
  "water",
  "internet",
  "waste",
  "house_cleaning",
  "pest_control",
  "plumbing",
  "electrical_maintenance",
  "ac_maintenance",
  "security",
  "parking",
  "utilities",
  "maintenance",
  "other",
];

export function serviceCategoryLabel(category) {
  const key = String(category ?? "").trim();
  if (SERVICE_CATEGORY_KEYS.includes(key)) {
    const path = `services.serviceCategories.${key}`;
    if (i18n.exists(path)) return i18n.t(path);
    const legacy = `propertyMgmt.serviceCategories.${key}`;
    if (i18n.exists(legacy)) return i18n.t(legacy);
  }
  return key || i18n.t("services.availableServicesTitle");
}

export function billingFrequencyLabel(frequency, t = i18n.t.bind(i18n)) {
  const key = String(frequency || "").toLowerCase();
  if (key === "yearly") return t("services.createServicePerYear");
  if (key === "one_time") return t("services.createServiceOneTime");
  if (key === "monthly") return t("services.createServicePerMonth");
  return "";
}

export async function fetchCommunityUnits(communityId) {
  const res = await apiRequest(`/communities/${communityId}/units`);
  return res.data ?? [];
}

export async function createCommunityUnit(communityId, unit_number) {
  const res = await apiRequest(`/communities/${communityId}/units`, {
    method: "POST",
    body: { unit_number },
  });
  return res.data;
}

export async function createAdminUnit(unit_number) {
  const res = await apiRequest("/admin/units", {
    method: "POST",
    body: { unit_number },
  });
  return res.data;
}

export async function fetchMyUnit() {
  const res = await apiRequest("/units/mine");
  return res.data ?? null;
}

/** Full multi-unit payload from GET /units/mine. */
export async function fetchMyUnits() {
  const res = await apiRequest("/units/mine");
  const units = Array.isArray(res.units) ? res.units : res.data ? [res.data] : [];
  return {
    unit: res.data ?? units[0] ?? null,
    units,
    meta: res.meta ?? {},
  };
}

export async function submitUnitRegistrationPackage({ kind, units }) {
  const res = await apiRequest("/units/mine/registration-packages", {
    method: "POST",
    body: { kind, units },
  });
  return { data: res.data, message: res.message };
}

/** Complete-profile multi-unit + per-unit proofs (invite assign or initial package). */
export async function completeOnboardingUnits({ units, communityId }) {
  const res = await apiRequest("/units/mine/onboarding-units", {
    method: "POST",
    body: {
      units,
      ...(communityId ? { community_id: Number(communityId) } : {}),
    },
  });
  return { data: res.data, message: res.message };
}

/** True when the signed-in resident is the unit's billing contact. */
export function viewerIsBillingContact(unit, userId) {
  if (!unit) return false;

  if (unit.is_billing_contact === true || unit.is_billing_contact === 1) {
    return true;
  }

  const viewerId = userId != null ? Number(userId) : null;
  if (viewerId == null) return false;

  const contactId = unit.billing_contact_user_id ?? unit.billing_contact?.id;
  return contactId != null && Number(contactId) === viewerId;
}

const BILLING_ACCESS_TTL_MS = 60_000;
let billingAccessCache = { value: null, at: 0, inflight: null };

export function getCachedViewerBillingAccess() {
  if (!billingAccessCache.value) return null;
  if (Date.now() - billingAccessCache.at > BILLING_ACCESS_TTL_MS) return null;
  return billingAccessCache.value;
}

export function invalidateViewerBillingAccessCache() {
  billingAccessCache = { value: null, at: 0, inflight: null };
}

function rememberViewerBillingAccess(value) {
  billingAccessCache = { value, at: Date.now(), inflight: null };
  return value;
}

export async function resolveViewerBillingAccess({ force = false } = {}) {
  if (!force) {
    const cached = getCachedViewerBillingAccess();
    if (cached) return cached;
    if (billingAccessCache.inflight) return billingAccessCache.inflight;
  }

  const request = (async () => {
    const [payload, user] = await Promise.all([
      fetchMyUnits().catch(() => ({ unit: null, units: [], meta: {} })),
      getUser(),
    ]);

    const active = (payload.units || []).filter(
      (row) => (row.association_status || "active") === "active",
    );
    const billingUnits = active.filter((row) => viewerIsBillingContact(row, user?.id));
    const unit = billingUnits[0] || payload.unit || active[0] || null;

    return rememberViewerBillingAccess({
      unit,
      units: active,
      billingUnits,
      isBillingContact: billingUnits.length > 0,
      contactName: unit?.billing_contact?.name || "",
      meta: payload.meta || {},
    });
  })();

  if (!force) {
    billingAccessCache.inflight = request;
    try {
      return await request;
    } finally {
      if (billingAccessCache.inflight === request) {
        billingAccessCache.inflight = null;
      }
    }
  }

  return request;
}

export async function requestBillingContactTransfer(nomineeUserId, message, unitId) {
  const res = await apiRequest("/units/mine/billing-contact-transfers", {
    method: "POST",
    body: {
      nominee_user_id: nomineeUserId,
      ...(unitId ? { unit_id: unitId } : {}),
      ...(message ? { message } : {}),
    },
  });
  invalidateViewerBillingAccessCache();
  return { data: res.data, message: res.message };
}

export async function acceptBillingContactTransfer(id) {
  const res = await apiRequest(`/billing-contact-transfers/${id}/accept`, { method: "PATCH" });
  invalidateViewerBillingAccessCache();
  return { data: res.data, message: res.message };
}

export async function rejectBillingContactTransfer(id, rejectionReason) {
  const res = await apiRequest(`/billing-contact-transfers/${id}/reject`, {
    method: "PATCH",
    body: rejectionReason ? { rejection_reason: rejectionReason } : {},
  });
  invalidateViewerBillingAccessCache();
  return { data: res.data, message: res.message };
}

export async function cancelBillingContactTransfer(id) {
  const res = await apiRequest(`/billing-contact-transfers/${id}/cancel`, { method: "PATCH" });
  invalidateViewerBillingAccessCache();
  return { data: res.data, message: res.message };
}

export async function fetchPropertyServices() {
  const res = await apiRequest("/property-services");
  return {
    services: res.data ?? [],
    unit: res.unit ?? null,
    units: Array.isArray(res.units) ? res.units : res.unit ? [res.unit] : [],
  };
}

export async function subscribeToPropertyService(id, note, unitId) {
  const res = await apiRequest(`/property-services/${id}/subscribe`, {
    method: "POST",
    body: {
      ...(note ? { note } : {}),
      ...(unitId ? { unit_id: unitId } : {}),
    },
  });
  return { data: res.data, message: res.message };
}

export async function unsubscribeFromPropertyService(id, unitId) {
  const res = await apiRequest(`/property-services/${id}/unsubscribe`, {
    method: "POST",
    body: unitId ? { unit_id: unitId } : {},
  });
  return res.data;
}

export async function fetchServiceBills() {
  const res = await apiRequest("/service-bills", { cache: "no-store" });
  return res.data ?? [];
}

export async function acknowledgeServiceBill(id) {
  const res = await apiRequest(`/service-bills/${id}/acknowledge`, { method: "POST" });
  return res.data;
}

export async function submitServiceBillProof(id, { file, payment_date, payment_reference, payment_bank, payment_note }) {
  const token = await getToken();
  if (!token) throw new ApiError(i18n.t("imagePicker.signInRequired"), { status: 401 });
  const fileAsset = file;
  if (!fileAsset?.uri) throw new ApiError(i18n.t("propertyMgmt.paymentProofRequired"), { status: 422 });
  const prepared = fileAsset.uploadPrepared ? fileAsset : await persistUploadAsset(fileAsset, "payment-proof");
  const communityId = await getCommunityId();
  const headers = {};
  if (communityId) headers["X-Community-Id"] = String(communityId);
  const parameters = { payment_date: String(payment_date) };
  if (payment_reference) parameters.payment_reference = String(payment_reference);
  if (payment_bank) parameters.payment_bank = String(payment_bank);
  if (payment_note) parameters.payment_note = String(payment_note);
  return uploadMultipartFile({
    url: `${API_BASE_URL}/service-bills/${id}/proof`,
    uri: prepared.uri,
    fieldName: "file",
    token,
    mimeType: prepared.mimeType || "image/jpeg",
    assetMeta: prepared,
    headers,
    parameters,
  });
}

export async function fetchAdminUnits() {
  const res = await apiRequest("/admin/units");
  return res.data ?? [];
}

export async function fetchAdminPropertyServices() {
  const res = await apiRequest("/admin/property-services");
  return res.data ?? [];
}

export async function createAdminPropertyService(payload) {
  const res = await apiRequest("/admin/property-services", {
    method: "POST",
    body: payload,
  });
  return { data: res.data, message: res.message };
}

export async function generateAdminServiceBills(id, payload) {
  const res = await apiRequest(`/admin/property-services/${id}/generate-bills`, {
    method: "POST",
    body: payload,
  });
  return res.data;
}

export async function fetchAdminServiceBills(status = "all") {
  const query = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiRequest(`/admin/service-bills${query}`, { cache: "no-store" });
  return res.data ?? [];
}

export async function approveAdminServiceBill(id) {
  const res = await apiRequest(`/admin/service-bills/${id}/approve`, { method: "PATCH" });
  return res.data;
}

export async function rejectAdminServiceBill(id, rejection_code, rejection_reason) {
  const payload = typeof rejection_code === "object" && rejection_code !== null
    ? rejection_code
    : { rejection_code, rejection_reason };
  const res = await apiRequest(`/admin/service-bills/${id}/reject`, {
    method: "PATCH",
    body: buildPaymentRejectionBody(payload.rejection_code, payload.rejection_reason),
  });
  return res?.data ?? null;
}
