import { apiRequest } from "./api-client";
import { getCommunityId, getToken, getUser } from "./auth-session";
import { API_BASE_URL } from "../constants/api-config";
import { resolveMediaUrl } from "../utils/profile-display";
import { guessImageMeta, uploadMultipartFile } from "../utils/upload-form-data";
import i18n from "../i18n";
import { getActiveRadiusMiles } from "./location-scope";
import { formatMilesLabel } from "../constants/location-radius";
import { extractHttpUrl } from "../utils/open-contact";
import { normalizeMenuItems } from "../components/marketplace/menu-list";

export async function fetchBusinesses({ scope = "browse", status, search, page = 1, perPage = 20, radiusMiles } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    scope,
  });
  if (status && status !== "all") params.set("status", status);
  if (search?.trim()) params.set("search", search.trim());
  if (scope === "browse") {
    const miles = radiusMiles === undefined ? getActiveRadiusMiles() : Number(radiusMiles);
    if (Number.isFinite(miles) && miles > 0) params.set("radius_miles", String(miles));
  }
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
  if (!token) throw new Error(i18n.t("imagePicker.signInRequired"));

  const { mimeType } = guessImageMeta(uri, assetMeta, "business-cover");
  const body = await uploadMultipartFile({
    url: `${API_BASE_URL}/businesses/upload-image`,
    uri,
    fieldName: "image",
    token,
    mimeType,
  });

  const imageUrl = resolveMediaUrl(body?.data?.image_url);
  if (!imageUrl) throw new Error(i18n.t("imagePicker.uploadFailed"));
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
  const distanceMiles = b.distance_miles == null ? null : Number(b.distance_miles);
  const distance =
    Number.isFinite(distanceMiles) && distanceMiles > 0 ? formatMilesLabel(distanceMiles) : "";
  return {
    id: b.id,
    name: b.name,
    category: b.category || "Other",
    description: b.description ?? "",
    address: b.address ?? "",
    phone: b.phone ?? "",
    hours: b.hours ?? "",
    amenities: stripHttpUrls(b.amenities ?? ""),
    website: b.website || extractHttpUrl(b.amenities) || extractHttpUrl(b.website) || "",
    menuItems: normalizeMenuItems(b.menu_items ?? b.menuItems),
    status: b.status,
    statusLabel: businessStatusLabel(b.status),
    ownerId: b.owner_id,
    ownerName: b.owner_name ?? "",
    communityId: b.community_id ?? null,
    communityName: b.community_name ?? "",
    distanceMiles,
    distance,
    isLocal: b.is_local !== false,
    latitude: b.latitude == null ? null : Number(b.latitude),
    longitude: b.longitude == null ? null : Number(b.longitude),
    // Keep raw path so CrispImage / mediaImageSource can use bundled seed art.
    imageUrl: b.image_url ?? null,
    createdAt: b.created_at,
  };
}

function stripHttpUrls(value) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s,]+/gi, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

function businessStatusLabel(status) {
  if (status === "approved") return "Active";
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  if (status === "inactive") return "Inactive";
  return status ?? "Unknown";
}
