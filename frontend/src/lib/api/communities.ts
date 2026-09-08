import api from "./client";

export type CommunityReviewStatus = "pending" | "approved" | "rejected";

export interface CommunityRequest {
  id: number;
  name: string;
  address: string | null;
  region: string | null;
  region_id: number | null;
  status: string;
  review_status: CommunityReviewStatus | null;
  rejection_reason: string | null;
  requested_by: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
  } | null;
  region_detail: {
    id: number;
    title: string;
    area: string;
    state: string | null;
  } | null;
  requester_profile?: {
    unit_number?: string | null;
    residence_type?: string | null;
    utility_bill_url?: string | null;
  } | null;
  created_at: string | null;
  reviewed_at: string | null;
}

export interface CommunityRequestStats {
  pending: number;
  approved: number;
  rejected: number;
}

export interface AdminCommunityOption {
  id: number;
  name: string;
  region: string | null;
  region_id: number | null;
  region_title: string | null;
  has_admin?: boolean;
}

export interface AdminCommunity extends AdminCommunityOption {
  address: string | null;
  description?: string | null;
  status: string;
  review_status: CommunityReviewStatus | null;
  rejection_reason: string | null;
  requested_by: CommunityRequest["requested_by"];
  admin_user?: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    suspension_reason: string | null;
  } | null;
  residents_count?: number;
  created_at: string | null;
  reviewed_at: string | null;
}

export function communityHasAssignedAdmin(
  community: Pick<AdminCommunity, "has_admin" | "admin_user">,
): boolean {
  if (typeof community.has_admin === "boolean") return community.has_admin;
  return Boolean(community.admin_user);
}

export interface AdminCommunityStats {
  total: number;
  active?: number;
  inactive?: number;
  pending: number;
  approved: number;
  rejected: number;
}

/** Simple active list for dropdowns (invite member, etc.) */
export async function fetchAdminCommunities() {
  const res = await api.get("/v1/admin/communities");
  return res.data as { data: AdminCommunityOption[] };
}

/** Paginated communities list for admin management */
export async function fetchAdminCommunitiesList(params?: Record<string, unknown>) {
  const res = await api.get("/v1/admin/communities", { params });
  return res.data as {
    data: AdminCommunity[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
      stats: AdminCommunityStats;
    };
  };
}

export async function createAdminCommunity(data: {
  name: string;
  region_id: number;
  address?: string;
  description?: string;
}) {
  const res = await api.post("/v1/admin/communities", data);
  return res.data as { data: AdminCommunity; message: string };
}

export async function updateAdminCommunity(
  id: number,
  data: {
    name?: string;
    region_id?: number;
    address?: string;
    description?: string;
  },
) {
  const res = await api.put(`/v1/admin/communities/${id}`, data);
  return res.data as { data: AdminCommunity; message: string };
}

export async function deleteAdminCommunity(id: number) {
  const res = await api.delete(`/v1/admin/communities/${id}`);
  return res.data as { message: string };
}

export async function fetchCommunityRequests(params?: Record<string, unknown>) {
  const res = await api.get("/v1/admin/community-requests", { params });
  return res.data as {
    data: CommunityRequest[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
      stats: CommunityRequestStats;
    };
  };
}

export async function fetchCommunityRequest(id: number) {
  const res = await api.get(`/v1/admin/community-requests/${id}`);
  return res.data as { data: CommunityRequest };
}

export async function approveCommunityRequest(id: number, regionId: number) {
  const res = await api.post(`/v1/admin/community-requests/${id}/approve`, {
    region_id: regionId,
  });
  return res.data as { data: CommunityRequest; message: string };
}

export async function rejectCommunityRequest(id: number, reason?: string) {
  const res = await api.post(`/v1/admin/community-requests/${id}/reject`, {
    reason,
  });
  return res.data as { data: CommunityRequest; message: string };
}

export async function updateCommunityStatus(id: number, status: "active" | "inactive") {
  const res = await api.patch(`/v1/admin/communities/${id}/status`, { status });
  return res.data as { data: AdminCommunity; message: string };
}

export async function fetchCommunityAdminInfo(id: number) {
  const res = await api.get(`/v1/admin/communities/${id}/admin`);
  return res.data.data as {
    community: AdminCommunity;
    admin: AdminCommunity["admin_user"];
  };
}

export async function assignCommunityAdmin(
  communityId: number,
  payload: {
    user_id?: number;
    name?: string;
    email?: string;
    phone?: string;
  },
) {
  const res = await api.post(`/v1/admin/communities/${communityId}/assign-admin`, payload);
  return res.data as {
    data: { community: AdminCommunity; admin: { id: number; name: string; email: string; phone: string | null; role: string } };
    message: string;
  };
}

/** Self-serve web onboarding after community-admin OTP signup. */
export async function selfServeCreateCommunity(payload: {
  community_name: string;
  address: string;
  region_id: number;
  estimated_residents?: number;
}) {
  const res = await api.post("/v1/communities/self-serve", payload);
  return res.data as {
    data: {
      community: { id: number; name: string; review_status?: string | null };
      membership: { id: number; community_id: number; role: string; status: string };
      user: Record<string, unknown>;
      access?: import("@/lib/auth/session").CommunityAdminAccess | null;
    };
    message: string;
  };
}

export type PublicRegion = {
  id: number;
  title: string;
  area?: string;
  state?: string | null;
  status?: string;
};

export type PublicCommunity = {
  id: number;
  name: string;
  region: string | null;
  region_id: number | null;
  description?: string | null;
  address: string | null;
  has_admin: boolean;
};

export async function fetchPublicRegions(params?: { q?: string }) {
  const res = await api.get("/v1/regions", { params });
  const payload = res.data;
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return (
    rows as Array<{
      type?: string;
      id: number;
      title: string;
      area?: string;
      state?: string | null;
      status?: string;
    }>
  ).filter((row) => row.type === "region" || row.type == null);
}

export async function searchPublicCommunities(params?: { region_id?: number; q?: string }) {
  const res = await api.get("/v1/communities/search", { params });
  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  return rows as PublicCommunity[];
}

export async function joinCommunity(communityId: number) {
  const res = await api.post(`/v1/communities/${communityId}/join`);
  return res.data as {
    data: {
      community: { id: number; name: string; review_status?: string | null };
      membership: { id: number; community_id: number; role: string; status: string };
    };
  };
}
