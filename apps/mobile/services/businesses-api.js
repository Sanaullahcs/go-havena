import { apiRequest } from "./api-client";
import { getCommunityId, getToken, getUser } from "./auth-session";
import { API_BASE_URL } from "../constants/api-config";
import { resolveMediaUrl } from "../utils/profile-display";
import { guessImageMeta, uploadMultipartFile } from "../utils/upload-form-data";

export async function fetchBusinesses({ scope = "browse", status, search, page = 1, perPage = 20 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    scope,
  });
  if (status && status !== "all") params.set("status", status);
  if (search?.trim()) params.set("search", search.trim());
  const res = await apiRequest(`/businesses?${params}`);
  return {
    businesses: (res.data ?? []).map(normalizeBusiness),
    meta: res.meta ?? {},
  };
}

export async function fetchBusiness(id) {
  const res = await apiRequest(`/businesses/${id}`);
  return normalizeBusiness(res.data);
}

/** Returns the current user's registered business in this community, if any. */
export async function fetchMyBusiness() {
  const user = await getUser();
  if (!user?.id) return null;
  const res = await fetchBusinesses({ scope: "manage", perPage: 100 });
  return res.businesses.find((b) => Number(b.ownerId) === Number(user.id)) ?? null;
}

export async function createBusiness(payload) {
  const communityId = await getCommunityId();
  const body = { ...payload };
  if (communityId) body.community_id = communityId;
  const res = await apiRequest("/businesses", { method: "POST", body });
  return normalizeBusiness(res.data);
}

export async function updateBusiness(id, payload) {
  const res = await apiRequest(`/businesses/${id}`, { method: "PATCH", body: payload });
  return normalizeBusiness(res.data);
}

export async function deleteBusiness(id) {
  await apiRequest(`/businesses/${id}`, { method: "DELETE" });
}

export async function approveBusiness(id) {
  const res = await apiRequest(`/admin/businesses/${id}/approve`, { method: "PATCH" });
  return { business: normalizeBusiness(res.data), meta: res.meta ?? {} };
}

export async function rejectBusiness(id) {
  const res = await apiRequest(`/admin/businesses/${id}/reject`, { method: "PATCH" });
  return { business: normalizeBusiness(res.data), meta: res.meta ?? {} };
}

export async function reapproveBusiness(id) {
  const res = await apiRequest(`/admin/businesses/${id}/reapprove`, { method: "PATCH" });
  return { business: normalizeBusiness(res.data), meta: res.meta ?? {} };
}

export async function uploadBusinessImage(uri, assetMeta = {}) {
  const token = await getToken();
  if (!token) throw new Error("You must be signed in to upload an image.");

  const { mimeType } = guessImageMeta(uri, assetMeta, "business-cover");
  const body = await uploadMultipartFile({
    url: `${API_BASE_URL}/businesses/upload-image`,
    uri,
    fieldName: "image",
    token,
    mimeType,
  });

  const imageUrl = resolveMediaUrl(body?.data?.image_url);
  if (!imageUrl) throw new Error("Image upload failed. Please try again.");
  return { image_url: imageUrl };
}

export async function publishBusinessWithImage(coverImage, payload) {
  let image_url;
  if (coverImage?.uri) {
    const uploaded = await uploadBusinessImage(coverImage.uri, coverImage);
    image_url = uploaded.image_url;
  }
  return createBusiness({ ...payload, image_url });
}

export function normalizeBusiness(b) {
  if (!b) return null;
  return {
    id: b.id,
    name: b.name,
    category: b.category || "Other",
    description: b.description ?? "",
    address: b.address ?? "",
    phone: b.phone ?? "",
    hours: b.hours ?? "",
    amenities: b.amenities ?? "",
    status: b.status,
    statusLabel: businessStatusLabel(b.status),
    ownerId: b.owner_id,
    ownerName: b.owner_name ?? "",
    imageUrl: resolveMediaUrl(b.image_url) || null,
    createdAt: b.created_at,
  };
}

function businessStatusLabel(status) {
  if (status === "approved") return "Active";
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  if (status === "inactive") return "Inactive";
  return status ?? "Unknown";
}
