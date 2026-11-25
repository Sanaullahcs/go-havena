import { apiRequest } from "./api-client";

export async function fetchAdminStats() {
  const res = await apiRequest("/admin/dashboard/stats?mobile=1");
  return res?.data ?? res;
}

export async function fetchAdminMembers({ status, page = 1, per_page = 20, search, role = "member" } = {}) {
  const params = new URLSearchParams({ page: String(page), per_page: String(per_page) });
  if (role && role !== "all") params.set("role", role);
  if (status && status !== "all") params.set("status", status);
  if (search?.trim()) params.set("search", search.trim());
  const res = await apiRequest(`/admin/members?${params}`);
  return { data: res.data ?? [], meta: res.meta ?? {} };
}

export async function approveMember(userId) {
  return apiRequest(`/admin/members/${userId}/approve`, { method: "PATCH" });
}

export async function rejectMember(userId, reason) {
  return apiRequest(`/admin/members/${userId}/reject`, {
    method: "PATCH",
    body: { reason: String(reason ?? "").trim() },
  });
}

export async function suspendMember(userId) {
  return apiRequest(`/admin/members/${userId}/suspend`, { method: "PATCH" });
}

export async function deleteMember(userId) {
  return apiRequest(`/admin/members/${userId}`, { method: "DELETE" });
}

export async function inviteMember({ name, email, phone, unit_number, units, role = "member" }) {
  const unitList = (Array.isArray(units) ? units : [])
    .map((unit) => String(unit ?? "").trim())
    .filter(Boolean);
  const body = { name, email, phone, role };
  if (unitList.length > 0) {
    body.units = unitList;
  } else if (String(unit_number ?? "").trim()) {
    body.unit_number = String(unit_number).trim();
  }
  return apiRequest("/admin/members/invite", {
    method: "POST",
    body,
  });
}

export async function fetchAdminListings({ status = "pending", page = 1, per_page = 20 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(per_page),
    status,
  });
  const res = await apiRequest(`/listings?${params}`);
  return { data: res.data ?? [], meta: res.meta ?? {} };
}

export async function approveListing(id) {
  return apiRequest(`/admin/listings/${id}/approve`, { method: "PATCH" });
}

export async function rejectListing(id) {
  return apiRequest(`/admin/listings/${id}/reject`, { method: "PATCH" });
}
