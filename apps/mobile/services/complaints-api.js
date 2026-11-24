import { API_BASE_URL } from "../constants/api-config";
import { apiRequest, ApiError } from "./api-client";
import { getCommunityId, getToken } from "./auth-session";
import { guessImageMeta } from "../utils/upload-form-data";
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

export async function markComplaintRead(id, admin = false) {
  await apiRequest(`${admin ? "/admin" : ""}/complaints/${id}/read`, { method: "POST" });
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

export async function updateComplaintStatus(id, status, note = null, files = []) {
  if (files?.length) {
    const fields = { status };
    if (note) fields.note = note;
    const res = await upload(`/complaints/${id}/status`, fields, files);
    return res.data;
  }
  const body = { status };
  if (note) body.note = note;
  const res = await apiRequest(`/complaints/${id}/status`, { method: "POST", body });
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

function appendUploadFile(form, file, index = 0) {
  const rawUri = String(file?.uri || "");
  if (!rawUri) return;
  const uri = rawUri.startsWith("/") ? `file://${rawUri}` : rawUri;
  const { fileName, mimeType } = guessImageMeta(uri, file, `complaint-${index + 1}`);
  // React Native multipart shape — more reliable than expo File blobs for PHP uploads.
  form.append("files[]", {
    uri,
    name: file.name || file.fileName || fileName,
    type: file.mimeType || mimeType || "application/octet-stream",
  });
}

function uploadErrorMessage(body) {
  const fieldError = Object.values(body?.errors ?? {})?.[0]?.[0];
  const raw = String(body?.message || fieldError || "Upload failed");
  if (/files\.\d+\s+failed to upload/i.test(raw) || /failed to upload/i.test(raw)) {
    return "This photo or file is too large for the server. Try a smaller image, or a file under 10 MB.";
  }
  return raw;
}

async function upload(path, fields, files) {
  const token = await getToken();
  if (!token) throw new ApiError(i18n.t("imagePicker.signInRequired"), { status: 401 });
  const communityId = await getCommunityId();
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, String(value));
  });
  files.forEach((file, index) => appendUploadFile(form, file, index));
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (communityId) headers["X-Community-Id"] = communityId;
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers, body: form });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { message: text }; }
  }
  if (!response.ok) {
    throw new ApiError(uploadErrorMessage(body), { status: response.status });
  }
  return body;
}

const staffRequest = { community: false };

export async function fetchStaffAccess() {
  const res = await apiRequest("/staff/access", staffRequest);
  return res.data;
}

export async function fetchStaffInvitations() {
  const res = await apiRequest("/staff/invitations", staffRequest);
  return res.data ?? [];
}

export async function acceptStaffInvitation(id) {
  return apiRequest(`/staff/invitations/${id}/accept`, { method: "POST", ...staffRequest });
}

export async function previewStaffInviteByToken(token) {
  const res = await apiRequest(`/staff/invitations/preview?token=${encodeURIComponent(String(token || ""))}`, {
    method: "GET",
    auth: false,
    community: false,
  });
  return res.data;
}

export async function acceptStaffInviteByToken(token) {
  return apiRequest("/staff/invitations/accept", {
    method: "POST",
    body: { token: String(token || "") },
    ...staffRequest,
  });
}

export async function fetchStaffTasks(params = {}) {
  return apiRequest(`/staff/tasks${query({ ...params, per_page: 20 })}`, staffRequest);
}

export async function fetchStaffTask(id) {
  const res = await apiRequest(`/staff/tasks/${id}`, staffRequest);
  return res.data;
}

export async function markStaffTaskRead(id) {
  await apiRequest(`/complaints/${id}/read`, { method: "POST", ...staffRequest });
}

export async function respondToStaffTask(id, decision, note) {
  const res = await apiRequest(`/staff/tasks/${id}/respond`, {
    method: "POST",
    body: { decision, note },
    ...staffRequest,
  });
  return res.data;
}

export async function updateStaffTaskStatus(id, status, note) {
  const res = await apiRequest(`/staff/tasks/${id}/status`, {
    method: "POST",
    body: { status, note },
    ...staffRequest,
  });
  return res.data;
}

export async function addStaffTaskUpdate(id, body, files = []) {
  if (!files.length) {
    const res = await apiRequest(`/staff/tasks/${id}/updates`, { method: "POST", body: { body }, ...staffRequest });
    return res.data;
  }
  const res = await upload(`/staff/tasks/${id}/updates`, { body }, files);
  return res.data;
}

export function complaintDownloadPath(id, attachmentId, admin = false) {
  const root = admin ? `/admin/complaints/${id}` : `/complaints/${id}`;
  return `${API_BASE_URL}${root}/attachments/${attachmentId}`;
}
