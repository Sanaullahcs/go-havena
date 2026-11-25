import api from "./client";
import { getAdminCommunityId } from "./members";

export type ServiceApplicationType = "automatic" | "optional";
export type ServiceCategory =
  | "electricity"
  | "water"
  | "internet"
  | "waste"
  | "house_cleaning"
  | "pest_control"
  | "plumbing"
  | "electrical_maintenance"
  | "ac_maintenance"
  | "security"
  | "parking"
  | "utilities"
  | "maintenance"
  | "other";

export const SERVICE_CATEGORY_OPTIONS: Array<{ value: Exclude<ServiceCategory, "utilities" | "maintenance">; label: string }> = [
  { value: "electricity", label: "Electricity" },
  { value: "water", label: "Water" },
  { value: "internet", label: "Internet" },
  { value: "waste", label: "Waste collection" },
  { value: "house_cleaning", label: "House cleaning" },
  { value: "pest_control", label: "Pest control" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical_maintenance", label: "Electrical maintenance" },
  { value: "ac_maintenance", label: "AC maintenance" },
  { value: "security", label: "Home security / Alarm" },
  { value: "parking", label: "Assigned parking" },
  { value: "other", label: "Other" },
];

const SERVICE_NAME_LETTER_MIN = 3;

export function serviceNameLetterCount(name: string): number {
  const matches = name.match(/\p{L}/gu);
  return matches?.length ?? 0;
}

/** Step-1 service name content rule (after trim); empty string is handled separately as required. */
export function serviceNameContentError(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  if (serviceNameLetterCount(trimmed) < SERVICE_NAME_LETTER_MIN) {
    return "Service name must include at least 3 letters. Numbers and symbols alone are not allowed.";
  }
  return undefined;
}

export function serviceCategoryLabel(category?: string | null, customCategory?: string | null): string {
  if (category === "other" && customCategory?.trim()) return customCategory.trim();
  return SERVICE_CATEGORY_OPTIONS.find((item) => item.value === category)?.label
    ?? ({ utilities: "Water", maintenance: "Plumbing" } as Record<string, string>)[category ?? ""]
    ?? category
    ?? "Service";
}

export type ServiceBillStatus =
  | "unpaid"
  | "acknowledged"
  | "pending_verification"
  | "paid"
  | "rejected"
  | "overdue";

export interface CommunityUnit {
  id: number;
  community_id: number;
  unit_number: string;
  kind: "residential" | "office" | string;
  status: "active" | "inactive" | string;
  billing_contact_user_id: number | null;
  billing_contact?: { id: number; name: string } | null;
  resident_count: number;
  is_billing_contact?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  residents?: Array<{
    id: number;
    name: string;
    email?: string;
    is_billing_contact: boolean;
    joined_at?: string | null;
  }>;
}

export interface PropertyService {
  id: number;
  community_id: number;
  name: string;
  category: ServiceCategory | string;
  custom_category?: string | null;
  description?: string | null;
  icon_key?: string | null;
  status: "active" | "inactive" | string;
  application_type: ServiceApplicationType;
  billing_frequency: "monthly" | "yearly" | "one_time" | string;
  amount_type: "fixed" | "variable" | string;
  amount?: number | null;
  due_day?: number | null;
  first_billing_month?: string | null;
  payment_instructions?: string | null;
  require_payment_proof: boolean;
  require_acknowledgement: boolean;
  auto_generate_bills: boolean;
  send_notice: boolean;
  send_notification: boolean;
  notice_title?: string | null;
  notice_body?: string | null;
  requires_admin_approval: boolean;
  max_subscribers?: number | null;
  unsubscribe_mode: "end_of_period" | "immediate" | string;
  active_subscribers?: number;
  pending_subscribers?: number;
  subscriber_count?: number;
  unit_subscription?: {
    id: number;
    status: string;
    starts_at?: string | null;
    ends_at?: string | null;
    note?: string | null;
    rejection_reason?: string | null;
  } | null;
  can_subscribe?: boolean;
  subscribe_blocked_reason?: string | null;
}

export interface ServiceBillPaymentProof {
  file_name?: string | null;
  file_url?: string | null;
  payment_date?: string | null;
  payment_reference?: string | null;
  payment_bank?: string | null;
  payment_note?: string | null;
}

export interface ServiceBillReview {
  id: number;
  action: string;
  actor_id?: number | null;
  actor_name?: string | null;
  status_from?: string | null;
  status_to?: string | null;
  proof?: ServiceBillPaymentProof | null;
  rejection_reason?: string | null;
  created_at?: string | null;
}

export interface UnitServiceBill {
  id: number;
  community_id?: number;
  service_id: number;
  service_name?: string | null;
  application_type?: ServiceApplicationType | string | null;
  billing_frequency?: "monthly" | "yearly" | "one_time" | string | null;
  unit_id: number;
  unit_number?: string | null;
  billing_period: string;
  billing_period_label?: string;
  title: string;
  description?: string | null;
  amount: number;
  due_date: string;
  status: ServiceBillStatus | string;
  status_label?: string;
  payment_instructions?: string | null;
  require_acknowledgement?: boolean;
  require_payment_proof?: boolean;
  invoice?: { file_name?: string | null; file_url?: string | null } | null;
  payment_proof?: ServiceBillPaymentProof | null;
  rejection_reason?: string | null;
  billing_contact?: { id: number; name: string | null } | null;
  missing_billing_contact?: boolean;
  can_acknowledge?: boolean;
  can_submit_proof?: boolean;
  can_review?: boolean;
  acknowledged_at?: string | null;
  acknowledged_by?: number | null;
  acknowledged_by_name?: string | null;
  reviews?: ServiceBillReview[];
  payment_method?: string | null;
  online_payment?: import("./kuickpay").OnlinePayment | null;
}

export interface ServiceSubscription {
  id: number;
  service_id: number;
  service_name?: string | null;
  unit_id: number;
  unit_number?: string | null;
  status: string;
  status_label?: string | null;
  note?: string | null;
  requester_name?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  latest_bill?: {
    id: number;
    title?: string | null;
    status: string;
    status_label?: string | null;
    amount?: number | null;
    billing_period?: string | null;
    billing_period_label?: string | null;
    due_date?: string | null;
    acknowledged_at?: string | null;
    acknowledged_by_name?: string | null;
  } | null;
}

export type PropertyServiceForm = {
  name: string;
  category: ServiceCategory | "";
  custom_category?: string | null;
  description?: string;
  icon_key?: string;
  status?: "active" | "inactive";
  application_type: ServiceApplicationType;
  billing_frequency?: "monthly" | "yearly" | "one_time";
  amount_type?: "fixed" | "variable";
  amount?: number | string | null;
  due_day?: number | null;
  first_billing_month?: string | null;
  payment_instructions?: string;
  require_payment_proof?: boolean;
  require_acknowledgement?: boolean;
  auto_generate_bills?: boolean;
  send_notice?: boolean;
  send_notification?: boolean;
  notice_title?: string;
  notice_body?: string;
  requires_admin_approval?: boolean;
  max_subscribers?: number | string | null;
  unsubscribe_mode?: "end_of_period" | "immediate";
};

function communityParams(communityId?: number | null) {
  const id = communityId && communityId > 0 ? communityId : getAdminCommunityId();
  return id ? { community_id: id } : undefined;
}

export async function fetchCommunityUnits(communityId: number) {
  const { data } = await api.get(`/v1/communities/${communityId}/units`);
  return (data.data ?? []) as CommunityUnit[];
}

export async function createCommunityUnit(communityId: number, unit_number: string) {
  const { data } = await api.post(`/v1/communities/${communityId}/units`, { unit_number });
  return data.data as CommunityUnit;
}

export async function fetchMyUnit() {
  const { data } = await api.get("/v1/units/mine");
  return (data.data ?? null) as CommunityUnit | null;
}

export type UnitRegistrationPackage = {
  id: number;
  community_id: number;
  user_id: number;
  kind: "initial" | "addon" | string;
  status: "pending" | "approved" | "rejected" | string;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
  resident_name?: string | null;
  resident_email?: string | null;
  unit_count: number;
  units: Array<{
    id: number;
    unit_id: number | null;
    unit_number: string;
    is_new_unit: boolean;
    residence_type?: string | null;
    status: string;
    proofs: Array<{ id: number; kind: string; file_url: string; review_status?: string | null }>;
  }>;
};

export async function fetchUnitRegistrationPackages(params?: { status?: string; kind?: string }) {
  const { data } = await api.get("/v1/admin/unit-registration-packages", {
    params: { ...communityParams(), ...params },
  });
  return (data.data ?? []) as UnitRegistrationPackage[];
}

export async function approveUnitRegistrationPackage(id: number, communityId?: number | null) {
  const { data } = await api.post(
    `/v1/admin/unit-registration-packages/${id}/approve`,
    {},
    { params: communityParams(communityId) },
  );
  return data.data as UnitRegistrationPackage;
}

export async function rejectUnitRegistrationPackage(id: number, reason: string, communityId?: number | null) {
  const { data } = await api.post(
    `/v1/admin/unit-registration-packages/${id}/reject`,
    { reason },
    { params: communityParams(communityId) },
  );
  return data.data as UnitRegistrationPackage;
}

export async function fetchAdminUnits() {
  const { data } = await api.get("/v1/admin/units", { params: communityParams() });
  return (data.data ?? []) as CommunityUnit[];
}

export async function createAdminUnit(payload: { unit_number: string; kind?: "residential" | "office" }) {
  const { data } = await api.post("/v1/admin/units", payload, { params: communityParams() });
  return data.data as CommunityUnit;
}

export async function updateAdminUnit(id: number, payload: Partial<{ unit_number: string; status: string; kind: string }>) {
  const { data } = await api.patch(`/v1/admin/units/${id}`, payload, { params: communityParams() });
  return data.data as CommunityUnit;
}

export async function deleteAdminUnit(id: number) {
  await api.delete(`/v1/admin/units/${id}`, { params: communityParams() });
}

export async function transferUnitBillingContact(id: number, userId: number) {
  const { data } = await api.patch(`/v1/admin/units/${id}/billing-contact`, { user_id: userId }, { params: communityParams() });
  return data.data as CommunityUnit;
}

export async function fetchAdminPropertyServices() {
  const { data } = await api.get("/v1/admin/property-services", { params: communityParams() });
  return (data.data ?? []) as PropertyService[];
}

export async function createPropertyService(payload: PropertyServiceForm) {
  const { data } = await api.post("/v1/admin/property-services", payload, { params: communityParams() });
  return data.data as PropertyService;
}

export async function updatePropertyService(id: number, payload: Partial<PropertyServiceForm>) {
  const { data } = await api.patch(`/v1/admin/property-services/${id}`, payload, { params: communityParams() });
  return data.data as PropertyService;
}

export async function deletePropertyService(id: number) {
  const { data } = await api.delete(`/v1/admin/property-services/${id}`, { params: communityParams() });
  return data as { message?: string };
}

export async function generateServiceBills(
  id: number,
  payload: { billing_period: string; title?: string; amount?: number; due_date?: string; description?: string; file?: File | null },
) {
  const form = new FormData();
  form.append("billing_period", payload.billing_period);
  if (payload.title) form.append("title", payload.title);
  if (payload.amount != null) form.append("amount", String(payload.amount));
  if (payload.due_date) form.append("due_date", payload.due_date);
  if (payload.description) form.append("description", payload.description);
  if (payload.file) form.append("file", payload.file);
  const { data } = await api.post(`/v1/admin/property-services/${id}/generate-bills`, form, { params: communityParams() });
  return data.data as { created_count: number; skipped_count: number; missing_billing_contacts: string[] };
}

export async function fetchServiceSubscriptions(id: number) {
  const { data } = await api.get(`/v1/admin/property-services/${id}/subscriptions`, { params: communityParams() });
  return (data.data ?? []) as ServiceSubscription[];
}

export async function fetchAdminServiceSubscriptionInbox() {
  const { data } = await api.get("/v1/admin/service-subscriptions", { params: communityParams() });
  return (data.data ?? []) as ServiceSubscription[];
}

export async function approveServiceSubscription(id: number) {
  const { data } = await api.patch(`/v1/admin/service-subscriptions/${id}/approve`, {}, { params: communityParams() });
  return data.data as ServiceSubscription;
}

export async function rejectServiceSubscription(id: number, rejection_reason?: string) {
  const { data } = await api.patch(`/v1/admin/service-subscriptions/${id}/reject`, { rejection_reason }, { params: communityParams() });
  return data.data as ServiceSubscription;
}

export async function fetchAdminServiceBills(params: { status?: string; service_id?: number } = {}) {
  const { data } = await api.get("/v1/admin/service-bills", { params: { ...communityParams(), ...params } });
  return (data.data ?? []) as UnitServiceBill[];
}

export async function fetchAdminServiceBill(id: number) {
  const { data } = await api.get(`/v1/admin/service-bills/${id}`, { params: communityParams() });
  return data.data as UnitServiceBill;
}

export async function approveServiceBill(id: number) {
  const { data } = await api.patch(`/v1/admin/service-bills/${id}/approve`, {}, { params: communityParams() });
  return data.data as UnitServiceBill;
}

export async function rejectServiceBill(id: number, rejection_code: string, rejection_reason?: string) {
  const { data } = await api.patch(`/v1/admin/service-bills/${id}/reject`, { rejection_code, rejection_reason }, { params: communityParams() });
  return data.data as UnitServiceBill;
}

export async function clarifyServiceBill(id: number, message: string) {
  const { data } = await api.patch(`/v1/admin/service-bills/${id}/clarify`, { message }, { params: communityParams() });
  return data.data as UnitServiceBill;
}

export async function fetchResidentPropertyServices() {
  const { data } = await api.get("/v1/property-services");
  return { services: (data.data ?? []) as PropertyService[], unit: (data.unit ?? null) as CommunityUnit | null };
}

export async function subscribeToPropertyService(id: number, note?: string) {
  const { data } = await api.post(`/v1/property-services/${id}/subscribe`, { note });
  return { data: data.data as ServiceSubscription, message: data.message as string };
}

export async function unsubscribeFromPropertyService(id: number) {
  const { data } = await api.post(`/v1/property-services/${id}/unsubscribe`);
  return data.data as ServiceSubscription;
}

export async function fetchResidentServiceBills() {
  const { data } = await api.get("/v1/service-bills");
  return (data.data ?? []) as UnitServiceBill[];
}

export async function acknowledgeServiceBill(id: number) {
  const { data } = await api.post(`/v1/service-bills/${id}/acknowledge`);
  return data.data as UnitServiceBill;
}

export async function submitServiceBillProof(
  id: number,
  payload: { file: File; payment_date: string; payment_reference?: string; payment_bank?: string; payment_note?: string },
) {
  const form = new FormData();
  form.append("file", payload.file);
  form.append("payment_date", payload.payment_date);
  if (payload.payment_bank) form.append("payment_bank", payload.payment_bank);
  if (payload.payment_reference) form.append("payment_reference", payload.payment_reference);
  if (payload.payment_note) form.append("payment_note", payload.payment_note);
  const { data } = await api.post(`/v1/service-bills/${id}/proof`, form);
  return data.data as UnitServiceBill;
}
