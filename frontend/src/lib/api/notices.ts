import api, { isProxyMethodBlocked } from "./client";

export interface EventWaitlistEntry {
  id: number;
  name: string;
  avatar_url: string | null;
  joined_at: string;
  position: number;
}

export interface Notice {
  id: number;
  title: string;
  category: string;
  body: string;
  description?: string;
  location: string | null;
  image_url: string | null;
  event_date: string | null;
  event_end_date?: string | null;
  event_time: string | null;
  event_time_end: string | null;
  registration_deadline_date?: string | null;
  registration_deadline_time?: string | null;
  is_registration_open?: boolean | null;
  schedule_timezone?: string | null;
  status: string;
  review_status: string;
  is_global: boolean;
  event_capacity?: number | null;
  is_pinned?: boolean;
  is_pinned_active?: boolean;
  scheduled_at?: string | null;
  requires_rsvp?: boolean;
  rsvp_count?: number;
  waitlist_count?: number;
  waitlist?: EventWaitlistEntry[];
  spots_remaining?: number | null;
  is_full?: boolean;
  is_waitlisted?: boolean;
  waitlist_position?: number | null;
  rejection_reason?: string | null;
  published_at: string | null;
  created_at: string;
  updated_at?: string;
  author_name: string;
  author_id?: number;
  author_avatar?: string | null;
  is_joined?: boolean;
  is_organizer?: boolean;
  community_id: number;
  community_name?: string | null;
  audience_type?: "all" | "selected";
  recipient_user_ids?: number[];
  recipients?: NoticeRecipient[];
}

export interface NoticeRecipient {
  id: number;
  name: string;
  unit_number?: string | null;
  units?: string[];
}

export interface NoticeStats {
  total: number;
  published: number;
  draft: number;
  scheduled?: number;
  archived: number;
  pending?: number;
  approved?: number;
  rejected?: number;
  upcoming?: number;
}

export interface NoticeFormData {
  title: string;
  body: string;
  category: string;
  location?: string;
  image_url?: string | null;
  event_date?: string;
  event_end_date?: string;
  event_time?: string;
  event_time_end?: string;
  registration_deadline_date?: string;
  registration_deadline_time?: string;
  event_capacity?: number | null;
  is_pinned?: boolean;
  scheduled_at?: string | null;
  requires_rsvp?: boolean;
  status?: string;
  is_global?: boolean;
  as_platform_admin?: boolean;
  audience_type?: "all" | "selected";
  recipient_user_ids?: number[];
}

export const NOTICE_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "maintenance", label: "Maintenance" },
  { value: "event", label: "Event" },
  { value: "security", label: "Security" },
  { value: "finance", label: "Finance" },
  { value: "emergency", label: "Emergency" },
] as const;

export function categoryLabel(value: string): string {
  return NOTICE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export async function fetchAdminNotices(params?: Record<string, unknown>) {
  const res = await api.get("/v1/admin/notices", { params });
  return res.data as {
    data: Notice[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      stats?: NoticeStats;
    };
  };
}

export async function fetchNotices(params?: Record<string, unknown>) {
  const res = await api.get("/v1/notices", { params });
  return res.data as {
    data: Notice[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      stats?: NoticeStats;
    };
  };
}

export async function fetchNotice(id: number) {
  const res = await api.get(`/v1/notices/${id}`);
  return res.data.data as Notice;
}

export type EventRsvpStatus = "going" | "maybe" | "not_going";

export async function rsvpNotice(id: number, status: EventRsvpStatus) {
  const res = await api.post(`/v1/notices/${id}/rsvp`, { status });
  return res.data.data as Notice;
}

export async function createNotice(data: NoticeFormData) {
  const res = await api.post("/v1/admin/notices", {
    ...data,
    as_platform_admin: true,
  });
  return res.data.data as Notice;
}

export async function createEvent(data: Omit<NoticeFormData, "category">) {
  const res = await api.post("/v1/admin/events", {
    ...data,
    as_platform_admin: true,
  });
  return res.data.data as Notice;
}

export async function createAlert(data: Omit<NoticeFormData, "category">) {
  const res = await api.post("/v1/admin/alerts", {
    ...data,
    as_platform_admin: true,
  });
  return res.data.data as Notice;
}

export async function updateNotice(id: number, data: Partial<NoticeFormData>) {
  const res = await api.post(`/v1/admin/notices/${id}`, data);
  return res.data.data as Notice;
}

export async function approveNotice(id: number) {
  const res = await api.post(`/v1/admin/notices/${id}/approve`);
  return res.data.data as Notice;
}

export async function rejectNotice(id: number, reason?: string) {
  const res = await api.post(`/v1/admin/notices/${id}/reject`, { reason });
  return res.data;
}

export async function deleteNotice(id: number) {
  try {
    return await api.delete(`/v1/admin/notices/${id}`);
  } catch (err: unknown) {
    if (isProxyMethodBlocked(err)) {
      return api.post(`/v1/admin/notices/${id}/delete`);
    }
    throw err;
  }
}

export async function uploadNoticeImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  const res = await api.post("/v1/admin/notices/upload-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data.image_url as string;
}
