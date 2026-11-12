import { File } from "expo-file-system";
import { API_BASE_URL } from "../constants/api-config";
import { apiRequest, ApiError } from "./api-client";
import { getCommunityId, getToken } from "./auth-session";
import i18n from "../i18n";

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== "all") {
      search.set(key, String(value));
    }
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function fetchMyComplaints(params = {}) {
  return apiRequest(`/complaints${query({ ...params, per_page: 20 })}`);
}

export async function fetchComplaintUnits() {
  const res = await apiRequest("/complaints/units");
  return res.data ?? [];
}

export async function fetchComplaint(id) {
  const res = await apiRequest(`/complaints/${id}`);
  return res.data;
}

export async function fetchAdminComplaints(params = {}) {
  return apiRequest(`/admin/complaints${query({ ...params, per_page: 20 })}`);
}

export async function fetchAdminComplaint(id) {
  const res = await apiRequest(`/admin/complaints/${id}`);
  return res.data;
}

export async function postComplaintMessage(id, body, files = []) {
  if (!files.length) {
    const res = await apiRequest(`/complaints/${id}/messages`, { method: "POST", body: { body } });
    return res.data;
  }
  const res = await upload(`/complaints/${id}/messages`, { body }, files);
  return res.data;
}

export async function postAdminComplaintMessage(id, body, visibility, files = []) {
  if (!files.length) {
    const res = await apiRequest(`/admin/complaints/${id}/messages`, {
      method: "POST",
      body: { body, visibility },
    });
    return res.data;
  }
  const res = await upload(`/admin/complaints/${id}/messages`, { body, visibility }, files);
  return res.data;
}

export async function updateComplaintStatus(id, status) {
  const res = await apiRequest(`/complaints/${id}/status`, { method: "POST", body: { status } });
  return res.data;
}

export async function updateAdminComplaintStatus(id, status) {
  const res = await apiRequest(`/admin/complaints/${id}/status`, { method: "POST", body: { status } });
  return res.data;
}

export async function assignComplaint(id, assignedToUserId) {
  const res = await apiRequest(`/admin/complaints/${id}/assign`, {
    method: "POST",
    body: { assigned_to_user_id: assignedToUserId },
  });
  return res.data;
}

export async function submitComplaintFeedback(id, rating, comment) {
  const res = await apiRequest(`/complaints/${id}/feedback`, {
    method: "POST",
    body: { rating, comment },
  });
  return res.data;
}

export async function createComplaint(fields, files = []) {
  const res = await upload("/complaints", fields, files);
  return res.data;
}

function appendUploadFile(form, file) {
  const rawUri = String(file?.uri || "");
  if (!rawUri) return;
  const uri = rawUri.startsWith("/") ? `file://${rawUri}` : rawUri;
  const name = file.name || file.fileName || "attachment";
  const type = file.mimeType || "application/octet-stream";
  const part = new File(uri);
  try {
    part.name = name;
  } catch {
    // The filename is still passed as the FormData filename argument.
  }
  try {
    part.type = type;
  } catch {
    // Expo derives the content type from the file extension when type is read-only.
  }
  form.append("files[]", part, name);
}

async function upload(path, fields, files) {
  const token = await getToken();
  if (!token) throw new ApiError(i18n.t("imagePicker.signInRequired"), { status: 401 });
  const communityId = await getCommunityId();
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, String(value));
  });
  files.forEach((file) => appendUploadFile(form, file));
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (communityId) headers["X-Community-Id"] = communityId;
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers, body: form });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { message: text }; }
  }
  if (!response.ok) {
    const message = body?.message
      || Object.values(body?.errors ?? {})?.[0]?.[0]
      || "Upload failed";
    throw new ApiError(message, { status: response.status });
  }
  return body;
}

export function complaintDownloadPath(id, attachmentId, admin = false) {
  const root = admin ? `/admin/complaints/${id}` : `/complaints/${id}`;
  return `${API_BASE_URL}${root}/attachments/${attachmentId}`;
}
