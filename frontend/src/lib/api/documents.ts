import api, { isProxyMethodBlocked } from "./client";

export interface DocumentRecipient {
  id: number;
  user_id: number;
  resident_name: string;
  unit_label: string | null;
  display_status: string;
  signature_status: string;
  signed_at: string | null;
  signed_file_url: string | null;
  signature_status?: string;
}

export interface DocumentActivity {
  id: number;
  event: string;
  meta: Record<string, unknown> | null;
  created_at: string | null;
  actor_name: string | null;
}

export interface SignatureSummary {
  required: number;
  signed: number;
  pending: number;
  overdue: number;
}

export interface SignatureTracking {
  required: number;
  signed: number;
  pending: number;
  overdue: number;
  documents: Array<{
    id: number;
    title: string;
    due_at: string | null;
    expires_at: string | null;
    required: number;
    signed: number;
    pending: number;
    overdue: number;
    signature_status: string | null;
  }>;
}

export interface CommunityDocument {
  id: number;
  community_id: number;
  title: string;
  category: string;
  description: string | null;
  file_url: string;
  file_name: string;
  file_size: number;
  file_size_label: string;
  mime_type: string | null;
  download_count: number;
  status: "active" | "inactive";
  publication_status?: "draft" | "published" | string;
  signature_required?: boolean;
  due_at?: string | null;
  expires_at?: string | null;
  version?: number;
  version_root_id?: number | null;
  supersedes_id?: number | null;
  assignment_scope?: "all" | "residents" | null;
  lifecycle?: "draft" | "published" | "archived" | "overdue" | string;
  signature_status?: "pending" | "signed" | "overdue" | null;
  signature_summary?: SignatureSummary;
  assigned_count?: number;
  activity?: DocumentActivity[];
  created_by: number;
  created_at: string;
  updated_at: string;
  stats?: {
    recipients: number;
    signed: number;
    pending: number;
    overdue: number;
  };
  recipients?: DocumentRecipient[];
}

export interface DocumentCategory {
  name: string;
  count: number;
}

export type DocumentForm = {
  title: string;
  category: string;
  description: string;
  status: "active" | "inactive";
  file?: File | null;
  publication_status?: "draft" | "published";
  signature_required?: boolean;
  due_at?: string;
  expires_at?: string;
  assignment_scope?: "all" | "residents";
  user_ids?: number[];
  notify?: boolean;
};

export {
  DOCUMENT_OTHER_CATEGORY,
  DOCUMENT_PRESET_CATEGORIES,
  PRESET_DOCUMENT_CATEGORIES,
  buildDocumentCategoryOptions,
  documentMatchesCategory,
  isDocumentOtherCategory,
  resolveDocumentCategory,
  splitDocumentCategory,
} from "@/lib/admin/document-categories";

export async function fetchAdminDocuments(params?: {
  status?: string;
  category?: string;
  search?: string;
}): Promise<{ data: CommunityDocument[]; categories: DocumentCategory[]; total: number }> {
  const p = new URLSearchParams();
  if (params?.status && params.status !== "all") p.set("status", params.status);
  if (params?.category) p.set("category", params.category);
  if (params?.search?.trim()) p.set("search", params.search.trim());
  const res = await api.get(`/v1/admin/documents?${p.toString()}`);
  return res.data as { data: CommunityDocument[]; categories: DocumentCategory[]; total: number };
}

function buildDocumentFormData(payload: DocumentForm, file?: File | null) {
  const form = new FormData();
  form.append("title", payload.title);
  form.append("category", payload.category);
  if (payload.description.trim()) form.append("description", payload.description.trim());
  form.append("status", payload.status);
  if (payload.publication_status) form.append("publication_status", payload.publication_status);
  if (payload.assignment_scope) form.append("assignment_scope", payload.assignment_scope);
  form.append("signature_required", payload.signature_required ? "1" : "0");
  form.append("notify", payload.notify === false ? "0" : "1");
  if (payload.due_at) form.append("due_at", payload.due_at);
  form.append("expires_at", payload.expires_at ?? "");
  (payload.user_ids ?? []).forEach((id) => form.append("user_ids[]", String(id)));
  if (file) form.append("file", file);
  return form;
}

export async function fetchDocument(id: number): Promise<CommunityDocument> {
  const res = await api.get(`/v1/documents/${id}`);
  return res.data.data as CommunityDocument;
}

export async function fetchSignatureTracking(): Promise<SignatureTracking> {
  const res = await api.get("/v1/admin/documents/signature-tracking");
  return res.data as SignatureTracking;
}

export async function archiveDocument(id: number): Promise<CommunityDocument> {
  const res = await api.post(`/v1/admin/documents/${id}/archive`);
  return res.data.data as CommunityDocument;
}

export async function restoreDocument(id: number): Promise<CommunityDocument> {
  const res = await api.post(`/v1/admin/documents/${id}/restore`);
  return res.data.data as CommunityDocument;
}

export async function extendDocumentDeadline(id: number, dueAt: string): Promise<CommunityDocument> {
  const res = await api.post(`/v1/admin/documents/${id}/deadline`, { due_at: dueAt });
  return res.data.data as CommunityDocument;
}

export async function remindDocument(id: number, assignmentId?: number): Promise<{ sent: number }> {
  const res = await api.post(`/v1/admin/documents/${id}/remind`, assignmentId ? { assignment_id: assignmentId } : {});
  return res.data as { sent: number };
}

export async function createDocument(payload: DocumentForm, file: File): Promise<CommunityDocument> {
  const form = buildDocumentFormData(payload, file);
  const res = await api.post("/v1/admin/documents", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as CommunityDocument;
}

export async function createDocumentVersion(
  id: number,
  payload: DocumentForm,
  file?: File | null,
): Promise<CommunityDocument> {
  const form = buildDocumentFormData(payload, file);
  const res = await api.post(`/v1/admin/documents/${id}/versions`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as CommunityDocument;
}

export async function updateDocument(
  id: number,
  payload: DocumentForm,
  file?: File | null,
  options?: { removeFile?: boolean },
): Promise<CommunityDocument> {
  const form = buildDocumentFormData(payload, file);
  if (options?.removeFile) form.append("remove_file", "1");
  const res = await api.post(`/v1/admin/documents/${id}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as CommunityDocument;
}

export async function setDocumentStatus(
  id: number,
  status: "active" | "inactive",
): Promise<CommunityDocument> {
  const form = new FormData();
  form.append("status", status);
  const res = await api.post(`/v1/admin/documents/${id}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as CommunityDocument;
}

export async function deleteDocument(id: number): Promise<void> {
  try {
    await api.delete(`/v1/admin/documents/${id}`);
  } catch (err: unknown) {
    if (isProxyMethodBlocked(err)) {
      await api.post(`/v1/admin/documents/${id}/delete`);
      return;
    }
    throw err;
  }
}

export async function createDocumentCategory(name: string): Promise<DocumentCategory> {
  const res = await api.post("/v1/admin/documents/categories", { name });
  return res.data.data as DocumentCategory;
}

export async function deleteDocumentCategory(name: string): Promise<void> {
  const p = new URLSearchParams({ name });
  await api.delete(`/v1/admin/documents/categories?${p.toString()}`);
}
