import { API_BASE_URL } from "../constants/api-config";
import { apiRequest, ApiError } from "./api-client";
import { getCommunityId, getToken } from "./auth-session";
import { guessImageMeta } from "../utils/upload-form-data";
import i18n from "../i18n";

/** GET /v1/documents */
export async function fetchCommunityDocuments(params = {}) {
  const p = new URLSearchParams();
  if (params.category) p.set("category", params.category);
  if (params.search?.trim()) p.set("search", params.search.trim());
  const qs = p.toString();
  const res = await apiRequest(`/documents${qs ? `?${qs}` : ""}`);
  return {
    documents:  res.data ?? [],
    recent:       res.recent ?? [],
    categories:   res.categories ?? [],
    total:        res.total ?? 0,
  };
}

/** GET /v1/documents/{id} */
export async function fetchCommunityDocument(id) {
  const res = await apiRequest(`/documents/${id}`);
  return res.data;
}

/** POST /v1/documents/{id}/download */
export async function recordDocumentDownload(id) {
  const res = await apiRequest(`/documents/${id}/download`, { method: "POST" });
  return res.data;
}

/** GET /v1/admin/documents */
export async function fetchAdminCommunityDocuments(params = {}) {
  const p = new URLSearchParams();
  if (params.status && params.status !== "all") p.set("status", params.status);
  if (params.category) p.set("category", params.category);
  if (params.search?.trim()) p.set("search", params.search.trim());
  const res = await apiRequest(`/admin/documents?${p.toString()}`);
  return {
    documents:  res.data ?? [],
    categories: res.categories ?? [],
    total:      res.total ?? 0,
  };
}

async function multipartRequest(path, { method = "POST", fields, fileAsset }) {
  const token = await getToken();
  if (!token) throw new ApiError(i18n.t("imagePicker.signInRequired"), { status: 401 });

  const communityId = await getCommunityId();
  const { mimeType, fileName } = guessImageMeta(fileAsset?.uri, fileAsset ?? {}, "document");

  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, String(value));
    }
  });
  if (fileAsset?.uri) {
    formData.append("file", { uri: fileAsset.uri, name: fileName, type: mimeType });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (communityId) headers["X-Community-Id"] = communityId;
  if (API_BASE_URL.includes("loca.lt")) headers["Bypass-Tunnel-Reminder"] = "true";

  const response = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: formData });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { message: text }; }
  }
  if (!response.ok) {
    throw new ApiError(body?.message ?? "Upload failed", { status: response.status });
  }
  return body;
}

/** POST /v1/admin/documents */
export async function createCommunityDocument(payload, fileAsset) {
  const body = await multipartRequest("/admin/documents", {
    method: "POST",
    fields: {
      title: payload.title,
      category: payload.category,
      description: payload.description ?? "",
      status: payload.status ?? "active",
    },
    fileAsset,
  });
  return body.data;
}

/** PATCH /v1/admin/documents/{id} */
export async function updateCommunityDocument(id, payload, fileAsset = null) {
  const body = await multipartRequest(`/admin/documents/${id}`, {
    method: "PATCH",
    fields: {
      title: payload.title,
      category: payload.category,
      description: payload.description ?? "",
      status: payload.status ?? "active",
      due_at: payload.due_at,
      effective_at: payload.effective_at,
      expires_at: payload.expires_at,
    },
    fileAsset,
  });
  return body.data;
}

/** DELETE /v1/admin/documents/{id} */
export async function deleteCommunityDocument(id) {
  await apiRequest(`/admin/documents/${id}`, { method: "DELETE" });
}

export async function fetchAdminAgreements() {
  const res = await apiRequest("/admin/documents/agreements?per_page=50");
  return res.data ?? [];
}

export async function fetchAgreementOptions(search = "") {
  const p = new URLSearchParams();
  if (search.trim()) p.set("search", search.trim());
  return apiRequest(`/admin/documents/agreements/options?${p.toString()}`);
}

export async function createAgreementDraft(payload, fileAsset) {
  const body = await multipartRequest("/admin/documents/agreements", {
    method: "POST",
    fields: {
      title: payload.title,
      category: payload.category,
      description: payload.description ?? "",
      due_at: payload.due_at ?? "",
      effective_at: payload.effective_at ?? "",
      expires_at: payload.expires_at ?? "",
    },
    fileAsset,
  });
  return body.data;
}

export async function publishAgreement(id, payload) {
  return apiRequest(`/admin/documents/agreements/${id}/publish`, {
    method: "POST",
    body: payload,
  });
}

export async function fetchAgreementDetail(id) {
  const res = await apiRequest(`/admin/documents/agreements/${id}`);
  return res.data;
}

export async function remindAgreement(id, assignmentId) {
  return apiRequest(`/admin/documents/agreements/${id}/remind`, {
    method: "POST",
    body: { assignment_id: assignmentId ?? null },
  });
}

export async function remindDocument(id, assignmentId) {
  return apiRequest(`/admin/documents/${id}/remind`, {
    method: "POST",
    body: { assignment_id: assignmentId ?? null },
  });
}

export async function signAgreement(id, payload) {
  return apiRequest(`/documents/${id}/sign`, { method: "POST", body: payload });
}

export async function fetchSignedAgreementLink(id, assignmentId) {
  const res = await apiRequest(`/documents/${id}/signed-link?assignment_id=${assignmentId}`);
  return res.url;
}

export {
  DOCUMENT_OTHER_CATEGORY,
  DOCUMENT_PRESET_CATEGORIES,
  PRESET_DOCUMENT_CATEGORIES,
  buildDocumentCategoryOptions,
  isDocumentOtherCategory,
  resolveDocumentCategory,
  splitDocumentCategory,
} from "../constants/document-categories";
