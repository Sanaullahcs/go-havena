import api from "./client";

export type ContactRole = "resident" | "admin" | "other";
export type ContactStatus = "new" | "read" | "archived";

export interface ContactSubmission {
  id: number;
  role: ContactRole;
  name: string;
  email: string;
  community: string | null;
  message: string;
  message_preview?: string;
  status: ContactStatus;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ContactSubmissionStats {
  new: number;
  read: number;
  archived: number;
  total: number;
}

export interface SubmitContactPayload {
  role: ContactRole;
  name: string;
  email: string;
  community?: string;
  message: string;
}

export async function submitContact(data: SubmitContactPayload) {
  const res = await api.post("/v1/contact", data);
  return res.data as { data: ContactSubmission; message: string };
}

export async function fetchContactSubmissions(params?: Record<string, unknown>) {
  const res = await api.get("/v1/admin/contact-submissions", { params });
  return res.data as {
    data: ContactSubmission[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
      stats: ContactSubmissionStats;
    };
  };
}

export async function fetchContactSubmission(id: number) {
  const res = await api.get(`/v1/admin/contact-submissions/${id}`);
  return res.data.data as ContactSubmission;
}

export async function updateContactSubmission(id: number, status: ContactStatus) {
  const res = await api.patch(`/v1/admin/contact-submissions/${id}`, { status });
  return res.data as { data: ContactSubmission; message: string };
}
