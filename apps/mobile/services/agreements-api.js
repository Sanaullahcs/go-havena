import { apiRequest } from "./api-client";

export const AGREEMENT_CATEGORIES = [
  { value: "lease", label: "Lease & occupancy" },
  { value: "pet", label: "Pet agreement" },
  { value: "parking", label: "Parking" },
  { value: "amenity", label: "Amenity waiver" },
  { value: "maintenance", label: "Maintenance access" },
  { value: "guest", label: "Guest policy" },
  { value: "general", label: "General" },
];

export const AGREEMENT_TEMPLATES = [
  {
    key: "living",
    title: "Resident Living Standards Acknowledgment",
    category: "lease",
    body:
      "This agreement confirms that you have received and understood the community living standards, including quiet hours, amenity booking rules, guest registration, and shared-space conduct.\n\nBy applying your paid digital signature you certify that you are the named resident and that this electronic signature is legally binding for community records.",
  },
  {
    key: "pet",
    title: "Pet Registration & Responsibility",
    category: "pet",
    body:
      "I agree to register my pet with the management office, keep animals leashed in common areas, and remain responsible for cleanup and any damage caused by my pet.",
  },
  {
    key: "parking",
    title: "Assigned Parking Acknowledgment",
    category: "parking",
    body:
      "I understand that my unit is assigned a designated parking space. Guest parking is limited to marked visitor bays for no more than 24 hours.",
  },
  {
    key: "waiver",
    title: "Amenity Use Waiver",
    category: "amenity",
    body:
      "I acknowledge that use of community amenities is at my own risk. I will follow posted hours, capacity limits, and safety rules.",
  },
];

export function categoryLabel(value) {
  return AGREEMENT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export async function fetchMyAgreements() {
  const res = await apiRequest("/agreements");
  const rows = Array.isArray(res?.data) ? res.data : [];
  return {
    data: rows,
    stats: res?.stats ?? { awaiting: 0, signed: 0 },
  };
}

export async function fetchAgreement(id) {
  const res = await apiRequest(`/agreements/${id}`);
  return res.data;
}

export async function authorizeAgreementFee(id) {
  const res = await apiRequest(`/agreements/${id}/authorize-fee`, { method: "POST" });
  return res;
}

export async function signAgreement(id, payload) {
  const res = await apiRequest(`/agreements/${id}/sign`, {
    method: "POST",
    body: payload,
  });
  return res;
}

export async function declineAgreement(id, reason) {
  const res = await apiRequest(`/agreements/${id}/decline`, {
    method: "POST",
    body: { reason },
  });
  return res;
}

export async function fetchAdminAgreements(params = {}) {
  const p = new URLSearchParams();
  if (params.status && params.status !== "all") p.set("status", params.status);
  if (params.search?.trim()) p.set("search", params.search.trim());
  const qs = p.toString();
  const res = await apiRequest(`/admin/agreements${qs ? `?${qs}` : ""}`);
  const rows = Array.isArray(res?.data) ? res.data : [];
  return {
    data: rows,
    stats: res?.stats ?? {},
  };
}

export async function fetchAdminAgreement(id) {
  const res = await apiRequest(`/admin/agreements/${id}`);
  return res.data;
}

export async function createAgreement(payload) {
  return apiRequest("/admin/agreements", {
    method: "POST",
    body: {
      ...payload,
      due_at: payload.due_at?.trim() ? payload.due_at : null,
    },
  });
}

export async function sendAgreement(id) {
  return apiRequest(`/admin/agreements/${id}/send`, { method: "POST" });
}

export async function closeAgreement(id) {
  return apiRequest(`/admin/agreements/${id}`, {
    method: "PATCH",
    body: { status: "closed" },
  });
}

export async function deleteAgreement(id) {
  return apiRequest(`/admin/agreements/${id}`, { method: "DELETE" });
}

export async function remindAgreement(id, userIds) {
  return apiRequest(`/admin/agreements/${id}/remind`, {
    method: "POST",
    body: userIds?.length ? { user_ids: userIds } : {},
  });
}

export async function reopenAgreement(id) {
  return apiRequest(`/admin/agreements/${id}/reopen`, { method: "POST" });
}

export async function withdrawAgreement(id) {
  return apiRequest(`/admin/agreements/${id}/withdraw`, { method: "POST" });
}

export async function reopenRecipient(id, userId) {
  return apiRequest(`/admin/agreements/${id}/recipients/${userId}/reopen`, { method: "POST" });
}

export async function removeRecipient(id, userId) {
  return apiRequest(`/admin/agreements/${id}/recipients/${userId}`, { method: "DELETE" });
}

export async function duplicateAgreement(id) {
  return apiRequest(`/admin/agreements/${id}/duplicate`, { method: "POST" });
}
