import api from "./client";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

export type ReassignReason =
  | "missing_admin"
  | "previous_admin_suspended"
  | "previous_admin_removed"
  | "community_inactive";

export type CommunityAdminLifecycleStatus =
  | "pending"
  | "active"
  | "suspended"
  | "reassign"
  | "rejected";

export type CommunityAdminAction =
  | "view"
  | "approve"
  | "reject"
  | "edit"
  | "release"
  | "suspend"
  | "reactivate"
  | "assign_community"
  | "delete"
  | "delete_record";

export type CommunityAdminApplicant = {
  id: number;
  reassign_row_id?: string;
  reassign_reason?: ReassignReason;
  reassign_summary?: string | null;
  lifecycle_status?: CommunityAdminLifecycleStatus;
  allowed_actions?: CommunityAdminAction[];
  previous_admin?: {
    id: number;
    name: string;
    status?: string;
    suspension_reason?: string | null;
  } | null;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  avatar_url?: string | null;
  community_admin_status: string;
  community_admin_rejection_reason?: string | null;
  status: string;
  suspension_reason?: string | null;
  needs_reassign?: boolean;
  created_at?: string;
  profile?: {
    display_name?: string;
    office_address?: string;
    unit_number?: string;
    residence_type?: string;
    avatar_url?: string | null;
    utility_bill_url?: string | null;
    utility_bill_review_status?: string | null;
  };
  community_request?: {
    id: number;
    name: string;
    review_status?: string;
    status?: string;
    region?: string;
  } | null;
  billing?: {
    subscription_status?: string | null;
    plan_slug?: string | null;
    card_on_file?: boolean;
    billing_complete?: boolean;
    trial_ends_at?: string | null;
    admin_transition?: boolean;
    leftover_ends_at?: string | null;
    has_leftover_service?: boolean;
    requires_replacement_card?: boolean;
  } | null;
};

export type CommunityAdminStats = {
  total: number;
  pending: number;
  approved: number;
  active?: number;
  suspended?: number;
  needs_reassign?: number;
  rejected: number;
};

export type CommunityAdminsResponse = {
  data: CommunityAdminApplicant[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page?: number;
    stats?: CommunityAdminStats;
  };
};

export async function fetchCommunityAdmins(params?: {
  status?: string;
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<CommunityAdminsResponse> {
  const res = await api.get("/v1/admin/community-admins", {
    params: {
      status: params?.status ?? "pending",
      search: params?.search || undefined,
      page: params?.page ?? 1,
      per_page: params?.per_page ?? ADMIN_TABLE_PAGE_SIZE,
    },
  });
  return {
    data: res.data?.data ?? [],
    meta: res.data?.meta ?? { current_page: 1, last_page: 1, total: 0 },
  };
}

export async function approveCommunityAdmin(id: number) {
  const res = await api.post(`/v1/admin/community-admins/${id}/approve`);
  return res.data;
}

export async function reapproveCommunityAdmin(id: number) {
  const res = await api.post(`/v1/admin/community-admins/${id}/reapprove`);
  return res.data;
}

export async function rejectCommunityAdmin(id: number, reason?: string) {
  const res = await api.post(`/v1/admin/community-admins/${id}/reject`, { reason });
  return res.data;
}

export async function suspendCommunityAdmin(id: number) {
  const res = await api.post(`/v1/admin/community-admins/${id}/suspend`);
  return res.data as { data: CommunityAdminApplicant; message: string };
}

export async function reactivateCommunityAdmin(id: number) {
  const res = await api.post(`/v1/admin/community-admins/${id}/reactivate`);
  return res.data as { data: CommunityAdminApplicant; message: string };
}

export async function releaseCommunityAdminAccount(id: number) {
  const res = await api.post(`/v1/admin/community-admins/${id}/release`);
  return res.data as { data: CommunityAdminApplicant; message: string };
}

export async function assignCommunityToAdmin(id: number, communityId: number) {
  const res = await api.post(`/v1/admin/community-admins/${id}/assign-community`, {
    community_id: communityId,
  });
  return res.data as { data: CommunityAdminApplicant; message: string };
}

export async function deleteCommunityAdmin(id: number) {
  const res = await api.delete(`/v1/admin/community-admins/${id}`, {
    data: { confirmation: "DELETE" },
  });
  return res.data as { message: string };
}

export type UpdateCommunityAdminPayload = {
  name?: string;
  email?: string;
  phone?: string | null;
  display_name?: string;
  office_address?: string;
};

export async function updateCommunityAdmin(
  id: number,
  payload: UpdateCommunityAdminPayload,
  utilityBill?: File | null,
) {
  if (utilityBill) {
    const form = new FormData();
    if (payload.name != null) form.append("name", payload.name);
    if (payload.phone != null) form.append("phone", payload.phone);
    if (payload.office_address != null) form.append("office_address", payload.office_address);
    if (payload.display_name != null) form.append("display_name", payload.display_name);
    form.append("utility_bill", utilityBill);
    const res = await api.post(`/v1/admin/community-admins/${id}`, form);
    return res.data as { data: CommunityAdminApplicant; message: string };
  }

  const res = await api.post(`/v1/admin/community-admins/${id}`, payload);
  return res.data as { data: CommunityAdminApplicant; message: string };
}
