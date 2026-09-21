import api from "./client";
import { DEFAULT_GUEST_PERMISSIONS, type GuestPermissions } from "../guest-permissions";

export type { GuestPermissions } from "../guest-permissions";
export { DEFAULT_GUEST_PERMISSIONS, GUEST_PERMISSION_OPTIONS, normalizeGuestPermissions } from "../guest-permissions";

export type GuestStatus =
  | "pending_verification"
  | "pending_approval"
  | "active"
  | "rejected"
  | "expired"
  | "revoked";

export type GuestInvitation = {
  id: number;
  community_id: number;
  community_name?: string;
  invitation_type: "resident" | "admin";
  guest_name: string;
  guest_email?: string | null;
  guest_phone: string;
  invite_code: string;
  invite_qr_value?: string;
  starts_at: string;
  ends_at: string;
  status: GuestStatus;
  permissions?: GuestPermissions;
  guest_user_id?: number | null;
  last_activity_at?: string | null;
  created_at: string;
  invited_by?: { id: number; name: string; display_name?: string } | null;
  resident?: { id: number; name: string; display_name?: string; unit_number?: string } | null;
  guest_avatar_url?: string | null;
};

export type GuestActivity = {
  id: number;
  action: string;
  description?: string | null;
  meta?: Record<string, unknown> | null;
  created_at: string;
};

export type GuestForm = {
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  starts_at: string;
  ends_at: string;
  permissions?: GuestPermissions;
};

export type GuestStats = {
  total: number;
  pending_verification: number;
  pending_approval: number;
  active: number;
  expired: number;
  revoked: number;
  rejected: number;
};

export type GuestListMeta = {
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
  stats: GuestStats;
};

export async function fetchGuests(params?: {
  status?: string;
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<{ data: GuestInvitation[]; meta: GuestListMeta }> {
  const p = new URLSearchParams();
  if (params?.status && params.status !== "all") p.set("status", params.status);
  if (params?.search?.trim()) p.set("search", params.search.trim());
  if (params?.page) p.set("page", String(params.page));
  if (params?.per_page) p.set("per_page", String(params.per_page));
  const res = await api.get(`/v1/admin/guests?${p.toString()}`);
  return res.data as { data: GuestInvitation[]; meta: GuestListMeta };
}

export async function fetchGuest(id: number): Promise<GuestInvitation> {
  const res = await api.get(`/v1/admin/guests/${id}`);
  return res.data.data as GuestInvitation;
}

export async function inviteGuest(payload: GuestForm): Promise<GuestInvitation> {
  const res = await api.post("/v1/admin/guests/invite", payload);
  return res.data.data as GuestInvitation;
}

export async function approveGuest(id: number): Promise<GuestInvitation> {
  const res = await api.patch(`/v1/admin/guests/${id}/approve`);
  return res.data.data as GuestInvitation;
}

export async function rejectGuest(id: number, reason?: string): Promise<GuestInvitation> {
  const res = await api.patch(`/v1/admin/guests/${id}/reject`, reason ? { reason } : {});
  return res.data.data as GuestInvitation;
}

export async function revokeGuest(id: number): Promise<GuestInvitation> {
  const res = await api.patch(`/v1/admin/guests/${id}/revoke`);
  return res.data.data as GuestInvitation;
}

export async function extendGuest(id: number, ends_at: string): Promise<GuestInvitation> {
  const res = await api.patch(`/v1/admin/guests/${id}/extend`, { ends_at });
  return res.data.data as GuestInvitation;
}

export type GuestActivityMeta = {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
};

export async function fetchGuestActivity(
  id: number,
  params?: { page?: number; perPage?: number },
): Promise<{ data: GuestActivity[]; meta: GuestActivityMeta }> {
  const p = new URLSearchParams();
  if (params?.page) p.set("page", String(params.page));
  if (params?.perPage) p.set("per_page", String(params.perPage));
  const qs = p.toString();
  const res = await api.get(`/v1/admin/guests/${id}/activity${qs ? `?${qs}` : ""}`);
  return {
    data: res.data.data as GuestActivity[],
    meta: res.data.meta as GuestActivityMeta,
  };
}

export const GUEST_STATUS_LABELS: Record<GuestStatus, string> = {
  pending_verification: "Pending verification",
  pending_approval: "Pending approval",
  active: "Active",
  rejected: "Rejected",
  expired: "Expired",
  revoked: "Revoked",
};

export const GUEST_STATUS_TONE: Record<GuestStatus, "green" | "amber" | "slate" | "red" | "blue" | "violet"> = {
  pending_verification: "blue",
  pending_approval: "amber",
  active: "green",
  rejected: "red",
  expired: "slate",
  revoked: "slate",
};
