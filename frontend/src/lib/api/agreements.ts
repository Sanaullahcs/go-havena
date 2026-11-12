import api from "./client";

export type AgreementStatus = "draft" | "published" | "archived" | "revoked" | "superseded";

export type AgreementSummary = {
  id: number;
  community_id: number;
  community_name: string | null;
  title: string;
  category: string;
  description: string | null;
  file_url: string;
  file_name: string;
  file_size: number;
  page_count: number | null;
  publication_status: AgreementStatus;
  signature_required: boolean;
  due_at: string | null;
  effective_at: string | null;
  expires_at: string | null;
  version: number;
  supersedes_id: number | null;
  published_at: string | null;
  assignment_scope: string | null;
  created_by_name: string | null;
  updated_at: string;
  stats: {
    recipients: number;
    signed: number;
    pending: number;
    viewed: number;
    declined: number;
    overdue: number;
    expired: number;
  } | null;
};

export type AgreementRecipient = {
  id: number;
  user_id: number;
  resident_name: string;
  unit_label: string | null;
  delivery_status: string;
  viewed_at: string | null;
  signature_status: string;
  display_status: string;
  signed_at: string | null;
  signed_file_url: string | null;
};

export type AgreementDetail = AgreementSummary & { recipients: AgreementRecipient[] };

export type RecipientOption = {
  id: number;
  name: string;
  status: string;
  units: { id: number; unit_number: string }[];
};

export type UnitOption = {
  id: number;
  unit_number: string;
  resident_count: number;
  residents: { id: number; name: string }[];
};

export type AgreementCounts = {
  all: number;
  draft: number;
  published: number;
  archived: number;
  revoked: number;
  superseded: number;
  overdue: number;
  expired: number;
  pending: number;
  signed: number;
};

export async function fetchAgreements(params?: {
  status?: string;
  search?: string;
  category?: string;
  due_from?: string;
  due_to?: string;
  page?: number;
}): Promise<{ data: AgreementSummary[]; meta: { current_page: number; last_page: number; total: number; counts: AgreementCounts } }> {
  const p = new URLSearchParams();
  if (params?.status && params.status !== "all") p.set("status", params.status);
  if (params?.category && params.category !== "all") p.set("category", params.category);
  if (params?.search?.trim()) p.set("search", params.search.trim());
  if (params?.due_from) p.set("due_from", params.due_from);
  if (params?.due_to) p.set("due_to", params.due_to);
  p.set("page", String(params?.page ?? 1));
  p.set("per_page", "20");
  const res = await api.get(`/v1/admin/documents/agreements?${p.toString()}`);
  return res.data;
}

export async function fetchAgreement(id: number): Promise<AgreementDetail> {
  const res = await api.get(`/v1/admin/documents/agreements/${id}`);
  return res.data.data as AgreementDetail;
}

export async function fetchAgreementOptions(search?: string): Promise<{
  residents: RecipientOption[];
  units: UnitOption[];
  resident_count: number;
}> {
  const p = new URLSearchParams();
  if (search?.trim()) p.set("search", search.trim());
  const res = await api.get(`/v1/admin/documents/agreements/options?${p.toString()}`);
  return res.data;
}

export async function createAgreementDraft(fields: {
  title: string;
  category: string;
  description?: string;
  due_at?: string;
  effective_at?: string;
  expires_at?: string;
  file: File;
}): Promise<AgreementSummary> {
  const form = new FormData();
  form.append("title", fields.title);
  form.append("category", fields.category);
  if (fields.description?.trim()) form.append("description", fields.description.trim());
  if (fields.due_at) form.append("due_at", fields.due_at);
  if (fields.effective_at) form.append("effective_at", fields.effective_at);
  if (fields.expires_at) form.append("expires_at", fields.expires_at);
  form.append("file", fields.file);
  const res = await api.post("/v1/admin/documents/agreements", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as AgreementSummary;
}

export async function updateAgreementDraft(
  id: number,
  fields: { title: string; category: string; description?: string; due_at?: string; effective_at?: string; expires_at?: string; file?: File | null },
): Promise<AgreementSummary> {
  const form = new FormData();
  form.append("title", fields.title);
  form.append("category", fields.category);
  form.append("description", fields.description?.trim() ?? "");
  if (fields.due_at) form.append("due_at", fields.due_at);
  if (fields.effective_at) form.append("effective_at", fields.effective_at);
  if (fields.expires_at) form.append("expires_at", fields.expires_at);
  if (fields.file) form.append("file", fields.file);
  const res = await api.post(`/v1/admin/documents/${id}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as AgreementSummary;
}

export async function publishAgreement(
  id: number,
  payload: { scope: "all" | "residents" | "units"; user_ids?: number[]; unit_ids?: number[]; notify?: boolean },
): Promise<{ data: AgreementSummary; assigned: number; already_published: boolean }> {
  const res = await api.post(`/v1/admin/documents/agreements/${id}/publish`, payload);
  return res.data;
}

export async function remindAgreement(id: number, assignmentId?: number): Promise<{ sent: number; skipped: number }> {
  const res = await api.post(`/v1/admin/documents/agreements/${id}/remind`, {
    assignment_id: assignmentId ?? null,
  });
  return res.data;
}

export async function archiveAgreement(id: number): Promise<void> {
  await api.post(`/v1/admin/documents/agreements/${id}/archive`);
}

export async function revokeAgreement(id: number): Promise<void> {
  await api.post(`/v1/admin/documents/agreements/${id}/revoke`);
}

export async function createAgreementVersion(
  id: number,
  file: File,
  fields?: {
    title?: string;
    category?: string;
    description?: string | null;
    due_at?: string | null;
    effective_at?: string | null;
    expires_at?: string | null;
  },
): Promise<AgreementSummary> {
  const form = new FormData();
  form.append("file", file);
  if (fields?.title) form.append("title", fields.title);
  if (fields?.category) form.append("category", fields.category);
  if (fields?.description) form.append("description", fields.description);
  if (fields?.due_at) form.append("due_at", fields.due_at);
  if (fields?.effective_at) form.append("effective_at", fields.effective_at);
  if (fields?.expires_at) form.append("expires_at", fields.expires_at);
  const res = await api.post(`/v1/admin/documents/agreements/${id}/versions`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as AgreementSummary;
}

export async function downloadAgreementExport(id: number): Promise<void> {
  const res = await api.get(`/v1/admin/documents/agreements/${id}/export`, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `agreement-${id}-signatures.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
