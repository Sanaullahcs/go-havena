import api, { isProxyMethodBlocked } from "./client";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { getManagedCommunityId, getUser, isSystemAdminUser } from "@/lib/auth/session";

export type MembershipStatus = "approved" | "pending" | "banned" | "rejected" | "inactive" | "onboarding" | "invitation_sent" | "not_invited";
export type MembershipRole = "member" | "moderator" | "admin";

export interface Member {
  id: number;
  name: string;
  email: string;
  account_status: string;
  status: MembershipStatus;
  role: MembershipRole;
  community_id: number | null;
  community_name?: string | null;
  membership_id: number | null;
  unit_number: string | null;
  units?: Array<{
    id: number | null;
    unit_number: string;
    association_status: string;
    is_billing_contact: boolean;
    residence_type?: string | null;
    utility_bill_url?: string | null;
    package_id?: number | null;
  }>;
  avatar_url: string | null;
  display_name: string | null;
  created_at: string;
  phone?: string | null;
  bio?: string | null;
  residence_type?: string | null;
  utility_bill_url?: string | null;
  updated_at?: string | null;
  rejection_reason?: string | null;
  rejected_by?: "system_admin" | "community_admin" | null;
  invite_code?: string | null;
  invite_code_expires_at?: string | null;
}

export interface MemberStats {
  total: number;
  approved: number;
  pending: number;
  banned: number;
  rejected: number;
  inactive?: number;
  onboarding?: number;
  invitation_sent?: number;
  not_invited?: number;
}

export interface MemberMeta {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
  community_id?: number | null;
  scope?: "all" | "community";
  stats?: MemberStats;
}

export interface MembersQuery {
  page?: number;
  per_page?: number;
  status?: MembershipStatus | "all";
  role?: MembershipRole | "all";
  search?: string;
  community_id?: number | "all";
}

const ROLE_TO_API: Record<string, MembershipRole> = {
  Resident: "member",
  Moderator: "moderator",
  Admin: "admin",
  member: "member",
  moderator: "moderator",
  admin: "admin",
};

export function roleToApi(role: string): MembershipRole {
  return ROLE_TO_API[role] ?? "member";
}

export function roleLabel(role: string): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "moderator":
      return "Moderator";
    case "guest":
      return "Guest";
    default:
      return "Resident";
  }
}

export function statusLabel(status: MembershipStatus): string {
  switch (status) {
    case "approved":
      return "Active";
    case "pending":
      return "Pending";
    case "invitation_sent":
      return "Invitation Sent";
    case "not_invited":
      return "Not Invited";
    case "onboarding":
      return "Onboarding";
    case "banned":
      return "Suspended";
    case "inactive":
      return "Inactive";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

export function getAdminCommunityId(): number | undefined {
  const user = getUser();
  return getManagedCommunityId(user) ?? user?.community_id;
}

function defaultCommunityScope(): number | "all" | undefined {
  if (isSystemAdminUser()) return "all";
  return getManagedCommunityId();
}

export async function fetchMembers(params: MembersQuery = {}) {
  const communityId = params.community_id ?? defaultCommunityScope();
  const query: MembersQuery = { ...params };
  delete query.community_id;

  const res = await api.get("/v1/admin/members", {
    params: {
      ...query,
      community_id: communityId,
    },
  });
  return res.data as { data: Member[]; meta: MemberMeta };
}

export async function fetchMember(id: number, communityId?: number) {
  const res = await api.get(`/v1/admin/members/${id}`, {
    params: communityId ? { community_id: communityId } : undefined,
  });
  return res.data.data as Member;
}

export type MemberActivityChange = {
  field: string;
  key?: string | null;
  previous: string;
  next: string;
};

export type MemberActivityLog = {
  id: number;
  action: string;
  activity_name: string;
  description: string;
  entity_type: string | null;
  entity_id: number | null;
  related_item: string | null;
  status: string | null;
  severity: string;
  ip_address: string | null;
  created_at: string;
  changes?: MemberActivityChange[];
  performed_by?: string | null;
  affected_user?: string | null;
};

export type MemberActivityMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  member?: {
    id: number;
    name: string;
    unit_number?: string | null;
    community_id: number;
  };
};

export async function fetchMemberActivityLogs(
  memberId: number,
  params: {
    communityId?: number;
    search?: string;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    perPage?: number;
  } = {},
) {
  const res = await api.get(`/v1/admin/members/${memberId}/activity-logs`, {
    params: {
      community_id: params.communityId,
      search: params.search,
      date: params.date,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      page: params.page ?? 1,
      per_page: params.perPage ?? ADMIN_TABLE_PAGE_SIZE,
    },
  });

  return res.data as { data: MemberActivityLog[]; meta: MemberActivityMeta };
}

export interface MemberInviteResult {
  id: number;
  invite_code: string;
  invite_qr_value: string;
  community_name?: string;
  temp_password?: string;
  expires_at?: string;
  member_name?: string;
  member_email?: string;
  email_sent?: boolean;
}

export interface MemberBatchIssue {
  field: string;
  message: string;
}

export interface MemberBatchRow {
  row: number;
  name: string;
  email: string;
  phone: string;
  unit: string;
  residence_type: string;
  errors: string[];
  issues?: MemberBatchIssue[];
}

export interface MemberBatchPreview {
  valid_count: number;
  invalid_count: number;
  rows: MemberBatchRow[];
}

export interface MemberBatchResult {
  sent_count: number;
  failed_count: number;
  sent: { row: number; name: string; email: string; email_sent: boolean }[];
  failed: { row: number; name: string; email: string; errors: string[] }[];
}

export function memberBatchTemplateCsv() {
  return "Name,Email,Phone Number,Unit / Apartment,Residence Type\n";
}

export async function previewMemberBatch(file: File) {
  const body = new FormData();
  body.append("file", file);
  const res = await api.post("/v1/admin/members/invite-batch/preview", body);
  return res.data as { data: MemberBatchPreview };
}

export async function commitMemberBatch(file: File) {
  const body = new FormData();
  body.append("file", file);
  const res = await api.post("/v1/admin/members/invite-batch", body);
  return res.data as { data: MemberBatchResult; message: string };
}

export async function inviteMember(data: {
  name: string;
  email: string;
  phone: string;
  role: string;
  unit_number?: string;
  units?: string[];
  community_id?: number;
}) {
  const communityId = data.community_id ?? getAdminCommunityId();
  const units = (data.units ?? []).map((u) => u.trim()).filter(Boolean);
  const res = await api.post("/v1/admin/members/invite", {
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: roleToApi(data.role),
    ...(units.length > 0
      ? { units }
      : data.unit_number
        ? { unit_number: data.unit_number }
        : {}),
    ...(communityId ? { community_id: communityId } : {}),
  });
  return res.data as { data: MemberInviteResult; message: string };
}

export async function resendMemberInvite(userId: number, communityId?: number) {
  const res = await api.post(`/v1/admin/members/${userId}/resend-invite`, {
    ...(communityId ? { community_id: communityId } : {}),
  });
  return res.data as { message: string; data?: { invite_code?: string; invite_qr_value?: string } };
}

export async function resendMemberInvites(memberIds: number[], communityId?: number) {
  const res = await api.post("/v1/admin/members/resend-invites", {
    member_ids: memberIds,
    ...(communityId ? { community_id: communityId } : {}),
  });
  return res.data as {
    message: string;
    data: {
      sent_count: number;
      failed_count: number;
      sent: { id: number; name?: string; email?: string }[];
      failed: { id: number; name?: string; message: string }[];
    };
  };
}

export async function approveMember(userId: number, communityId?: number) {
  return api.post(`/v1/admin/members/${userId}/approve`, communityId ? { community_id: communityId } : {});
}

export async function rejectMember(userId: number, reason: string, communityId?: number) {
  return api.post(`/v1/admin/members/${userId}/reject`, {
    reason,
    ...(communityId ? { community_id: communityId } : {}),
  });
}

export async function approveFamilyAddMemberRequest(requestId: number, communityId?: number) {
  return api.post(`/v1/admin/family-add-member-requests/${requestId}/approve`, null, {
    params: communityId ? { community_id: communityId } : undefined,
  });
}

export async function rejectFamilyAddMemberRequest(
  requestId: number,
  reason: string,
  communityId?: number,
) {
  return api.post(
    `/v1/admin/family-add-member-requests/${requestId}/reject`,
    { reason },
    {
      params: communityId ? { community_id: communityId } : undefined,
    },
  );
}

export async function suspendMember(userId: number, communityId?: number) {
  return api.post(`/v1/admin/members/${userId}/suspend`, communityId ? { community_id: communityId } : {});
}

export async function deactivateMember(id: number, communityId?: number) {
  const config = { params: communityId ? { community_id: communityId } : undefined };
  try {
    return await api.post(`/v1/admin/members/${id}/deactivate`, {}, config);
  } catch (err: unknown) {
    if (isProxyMethodBlocked(err)) {
      return api.post(`/v1/admin/members/${id}/delete`, {}, config);
    }
    throw err;
  }
}

/** @deprecated Use deactivateMember — hard delete is no longer supported. */
export async function deleteMember(id: number, communityId?: number) {
  return deactivateMember(id, communityId);
}

export function membersToCsv(rows: Member[]): string {
  const header = ["Name", "Email", "Phone Number", "Community", "Unit", "Role", "Status", "Joined"];
  const lines = rows.map((m) => [
    m.name,
    m.email,
    (m.phone ?? "").trim(),
    m.community_name ?? "",
    (m.units?.length
      ? m.units.map((u) => u.unit_number).filter(Boolean).join("; ")
      : m.unit_number) ?? "",
    roleLabel(m.role),
    statusLabel(m.status),
    new Date(m.created_at).toISOString().slice(0, 10),
  ]);
  return [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
