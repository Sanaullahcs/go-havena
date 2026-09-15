import { apiRequest } from "./api-client";

export async function fetchAdminGuests(params = {}) {
  const p = new URLSearchParams();
  if (params.status && params.status !== "all") p.set("status", params.status);
  if (params.search?.trim()) p.set("search", params.search.trim());
  const res = await apiRequest(`/admin/guests?${p.toString()}`);
  return { guests: res.data ?? [], meta: res.meta ?? {} };
}

export async function fetchAdminGuest(id) {
  const res = await apiRequest(`/admin/guests/${id}`);
  return res.data;
}

export async function inviteAdminGuest(payload) {
  const res = await apiRequest("/admin/guests/invite", { method: "POST", body: payload });
  return res.data;
}

export async function revokeAdminGuest(id) {
  const res = await apiRequest(`/admin/guests/${id}/revoke`, { method: "PATCH" });
  return res.data;
}

export async function extendAdminGuest(id, ends_at) {
  const res = await apiRequest(`/admin/guests/${id}/extend`, { method: "PATCH", body: { ends_at } });
  return res.data;
}

export async function fetchAdminGuestActivity(id) {
  const res = await apiRequest(`/admin/guests/${id}/activity`);
  return res.data ?? [];
}

export async function createResidentGuestInvitation(payload) {
  const res = await apiRequest("/guest-invitations", { method: "POST", body: payload });
  return res.data;
}

export async function fetchMyGuestInvitations() {
  const res = await apiRequest("/guest-invitations/mine");
  return res.data ?? [];
}

export async function fetchPendingGuestApprovals() {
  const res = await apiRequest("/guest-invitations/pending-approval");
  return res.data ?? [];
}

export async function approveGuestInvitation(id) {
  const res = await apiRequest(`/guest-invitations/${id}/approve`, { method: "PATCH" });
  return res.data;
}

export async function rejectGuestInvitation(id, reason) {
  const res = await apiRequest(`/guest-invitations/${id}/reject`, {
    method: "PATCH",
    body: reason ? { reason } : {},
  });
  return res.data;
}

export async function requestGuestOtp(email) {
  const response = await apiRequest("/auth/guest/otp/request", {
    method: "POST",
    body: { email: String(email ?? "").trim().toLowerCase() },
    auth: false,
  });

  return {
    ...(response?.data ?? {}),
    rate_limit: response?.data?.rate_limit ?? null,
  };
}

export async function verifyGuestOtp(email, code) {
  return apiRequest("/auth/guest/otp/verify", {
    method: "POST",
    body: { email: String(email ?? "").trim().toLowerCase(), code },
    auth: false,
  });
}

export async function verifyGuestInvite(email, code, invite_code) {
  return apiRequest("/auth/guest/verify-invite", {
    method: "POST",
    body: { email: String(email ?? "").trim().toLowerCase(), code, invite_code },
    auth: false,
  });
}

export async function fetchGuestAccessStatus() {
  const res = await apiRequest("/guest-access/status");
  return res.data;
}
