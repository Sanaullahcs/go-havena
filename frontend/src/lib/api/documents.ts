import api, { isProxyMethodBlocked } from "./client";

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
  created_by: number;
  created_at: string;
  updated_at: string;
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
};

export {
  DOCUMENT_OTHER_CATEGORY,
  DOCUMENT_PRESET_CATEGORIES,
  PRESET_DOCUMENT_CATEGORIES,
  buildDocumentCategoryOptions,
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
  if (file) form.append("file", file);
  return form;
}

export async function createDocument(payload: DocumentForm, file: File): Promise<CommunityDocument> {
  const form = buildDocumentFormData(payload, file);
  const res = await api.post("/v1/admin/documents", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as CommunityDocument;
}

export async function updateDocument(
  id: number,
  payload: DocumentForm,
  file?: File | null,
): Promise<CommunityDocument> {
  const form = buildDocumentFormData(payload, file);
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
