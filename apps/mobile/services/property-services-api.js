import { API_BASE_URL } from "../constants/api-config";
import { apiRequest, ApiError } from "./api-client";
import { getCommunityId, getToken, getUser } from "./auth-session";
import { persistUploadAsset, uploadMultipartFile } from "../utils/upload-form-data";
import i18n from "../i18n";

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

export async function resolveViewerBillingAccess() {
  const [unit, user] = await Promise.all([
    fetchMyUnit().catch(() => null),
    getUser(),
  ]);

  return {
    unit,
    isBillingContact: viewerIsBillingContact(unit, user?.id),
    contactName: unit?.billing_contact?.name || "",
  };
}

export async function requestBillingContactTransfer(nomineeUserId, message) {
  const res = await apiRequest("/units/mine/billing-contact-transfers", {
    method: "POST",
    body: {
      nominee_user_id: nomineeUserId,
      ...(message ? { message } : {}),
    },
  });
  return { data: res.data, message: res.message };
}

export async function acceptBillingContactTransfer(id) {
  const res = await apiRequest(`/billing-contact-transfers/${id}/accept`, { method: "PATCH" });
  return { data: res.data, message: res.message };
}

export async function rejectBillingContactTransfer(id, rejectionReason) {
  const res = await apiRequest(`/billing-contact-transfers/${id}/reject`, {
    method: "PATCH",
    body: rejectionReason ? { rejection_reason: rejectionReason } : {},
  });
  return { data: res.data, message: res.message };
}

export async function cancelBillingContactTransfer(id) {
  const res = await apiRequest(`/billing-contact-transfers/${id}/cancel`, { method: "PATCH" });
  return { data: res.data, message: res.message };
}

export async function fetchPropertyServices() {
  const res = await apiRequest("/property-services");
  return { services: res.data ?? [], unit: res.unit ?? null };
}

export async function subscribeToPropertyService(id, note) {
  const res = await apiRequest(`/property-services/${id}/subscribe`, {
    method: "POST",
    body: note ? { note } : {},
  });
  return { data: res.data, message: res.message };
}

export async function unsubscribeFromPropertyService(id) {
  const res = await apiRequest(`/property-services/${id}/unsubscribe`, { method: "POST" });
  return res.data;
}

export async function fetchServiceBills() {
  const res = await apiRequest("/service-bills");
  return res.data ?? [];
}

export async function acknowledgeServiceBill(id) {
  const res = await apiRequest(`/service-bills/${id}/acknowledge`, { method: "POST" });
  return res.data;
}

export async function submitServiceBillProof(id, { file, payment_date, payment_reference, payment_note }) {
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
  const res = await apiRequest(`/admin/service-bills${query}`);
  return res.data ?? [];
}

export async function approveAdminServiceBill(id) {
  const res = await apiRequest(`/admin/service-bills/${id}/approve`, { method: "PATCH" });
  return res.data;
}

export async function rejectAdminServiceBill(id, rejection_code, rejection_reason) {
  const res = await apiRequest(`/admin/service-bills/${id}/reject`, {
    method: "PATCH",
    body: { rejection_code, rejection_reason },
  });
  return res.data;
}
