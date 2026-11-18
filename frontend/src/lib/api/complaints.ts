import api, { apiError } from "@/lib/api/client";

export type ComplaintStatus =
  | "submitted"
  | "in_review"
  | "in_progress"
  | "waiting_on_resident"
  | "not_resolved"
  | "resolved"
  | "reopened"
  | "closed"
  | "cancelled";

export type ComplaintRecord = {
  id: number;
  reference: string;
  type: "maintenance" | "technical";
  routed_to: "community_admin" | "system_admin";
  community_id: number | null;
  unit_id: number | null;
  unit_number: string | null;
  reporter_user_id: number;
  reporter_name: string;
  category: string;
  category_label: string;
  priority: "low" | "normal" | "high" | "urgent";
  title: string;
  description?: string;
  status: ComplaintStatus;
  status_label: string;
  workflow_status?: string;
  assigned_to_user_id: number | null;
  assigned_staff_id?: number | null;
  assigned_to_name: string | null;
  assigned_staff_label?: string | null;
  community_name?: string | null;
  support_team: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  allowed_transitions?: ComplaintStatus[];
  feedback_rating?: number | null;
  feedback_comment?: string | null;
  unread_count?: number;
  messages?: ComplaintMessage[];
  attachments?: ComplaintAttachment[];
  events?: ComplaintEvent[];
  assignees?: Array<{ id: number; name: string; label?: string; matched?: boolean; staff_id?: number }>;
};

export type ComplaintMessage = {
  id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  visibility: "public" | "internal";
  created_at: string;
};

export type ComplaintAttachment = {
  id: number;
  message_id: number | null;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  created_at: string;
};

export type ComplaintEvent = {
  id: number;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

/** Same cadence as the admin messages inbox. */
export const ADMIN_COMPLAINT_SYNC_MS = 4_000;

export function isComplaintNotification(payload: { link?: string | null; title?: string | null }) {
  const link = (payload.link ?? "").toLowerCase();
  const title = (payload.title ?? "").toLowerCase();
  return link.includes("complaint") || title.includes("complaint");
}

export type ComplaintList = {
  data: ComplaintRecord[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    counts: Record<string, number>;
    staff_revision?: string | null;
  };
};

export async function fetchAdminComplaints(params: {
  search?: string;
  status?: string;
  category?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}): Promise<ComplaintList> {
  const query = new URLSearchParams();
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.category && params.category !== "all") query.set("category", params.category);
  if (params.priority && params.priority !== "all") query.set("priority", params.priority);
  if (params.dateFrom) query.set("date_from", params.dateFrom);
  if (params.dateTo) query.set("date_to", params.dateTo);
  if (params.page) query.set("page", String(params.page));
  query.set("per_page", "8");
  const res = await api.get(`/v1/admin/complaints?${query.toString()}`);
  return res.data as ComplaintList;
}

export async function fetchAdminComplaint(id: number): Promise<ComplaintRecord> {
  const res = await api.get(`/v1/admin/complaints/${id}`);
  return res.data.data as ComplaintRecord;
}

export async function postAdminComplaintMessage(
  id: number,
  body: string,
  visibility: "public" | "internal",
  files: File[] = [],
): Promise<ComplaintRecord> {
  if (files.length > 0) {
    const form = new FormData();
    form.append("body", body);
    form.append("visibility", visibility);
    files.slice(0, 5).forEach((file) => form.append("files[]", file));
    const res = await api.post(`/v1/admin/complaints/${id}/messages`, form);
    return res.data.data as ComplaintRecord;
  }
  const res = await api.post(`/v1/admin/complaints/${id}/messages`, { body, visibility });
  return res.data.data as ComplaintRecord;
}

export async function updateAdminComplaintStatus(id: number, status: string): Promise<ComplaintRecord> {
  const res = await api.post(`/v1/admin/complaints/${id}/status`, { status });
  return res.data.data as ComplaintRecord;
}

export async function markAdminComplaintRead(id: number): Promise<void> {
  await api.post(`/v1/admin/complaints/${id}/read`);
}

export async function assignAdminComplaint(id: number, assignedToUserId: number): Promise<ComplaintRecord> {
  const res = await api.post(`/v1/admin/complaints/${id}/assign`, { assigned_to_user_id: assignedToUserId });
  return res.data.data as ComplaintRecord;
}

export async function fetchAdminComplaintAssignees(id: number): Promise<NonNullable<ComplaintRecord["assignees"]>> {
  const res = await api.get(`/v1/admin/complaints/${id}/assignees`);
  return (res.data.data ?? []) as NonNullable<ComplaintRecord["assignees"]>;
}

export async function downloadAdminComplaintAttachment(id: number, attachmentId: number): Promise<Blob> {
  const res = await api.get(`/v1/admin/complaints/${id}/attachments/${attachmentId}`, { responseType: "blob" });
  return res.data as Blob;
}

export { apiError };
