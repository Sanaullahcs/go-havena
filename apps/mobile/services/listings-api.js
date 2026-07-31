import { apiRequest } from "./api-client";
import { getCommunityId, getToken } from "./auth-session";
import { API_BASE_URL } from "../constants/api-config";
import { resolveMediaUrl } from "../utils/profile-display";
import { guessImageMeta, uploadMultipartFile } from "../utils/upload-form-data";

/** Mobile UI uses item/service; API expects for_sale/service/deal */
export function normalizeListingType(type) {
  const key = String(type ?? "item").toLowerCase();
  if (key === "item" || key === "sale" || key === "for_sale") return "for_sale";
  if (key === "service") return "service";
  if (key === "deal") return "deal";
  return "for_sale";
}

export function isServiceListingType(type) {
  return normalizeListingType(type) === "service";
}

export function isItemListingType(type) {
  return normalizeListingType(type) === "for_sale";
}

export async function fetchListings({ type, category, page = 1, search, mine } = {}) {
  const params = new URLSearchParams({ page });
  if (type) params.set("type", type);
  if (category) params.set("category", category);
  if (search?.trim()) params.set("search", search.trim());
  if (mine) params.set("mine", "1");
  const res = await apiRequest(`/listings?${params.toString()}`);
  return res;
}

export async function fetchListing(id) {
  const res = await apiRequest(`/listings/${id}`);
  return res.data;
}

export async function uploadListingImage(uri, assetMeta = {}) {
  const token = await getToken();
  if (!token) throw new Error("You must be signed in to upload a photo.");

  const communityId = await getCommunityId();
  const { mimeType } = guessImageMeta(uri, assetMeta, "listing-photo");
  const headers = {};
  if (communityId) headers["X-Community-Id"] = String(communityId);

  const body = await uploadMultipartFile({
    url: `${API_BASE_URL}/listings/upload-image`,
    uri,
    fieldName: "image",
    token,
    mimeType,
    headers,
  });

  const imageUrl = resolveMediaUrl(body?.data?.image_url);
  if (!imageUrl) throw new Error("Photo upload failed. Please try again.");
  return { image_url: imageUrl };
}

/** Upload selected photos, then create the listing. */
export async function publishListingWithImages(photoAssets, payload, { onProgress } = {}) {
  const queue = photoAssets.filter((asset) => asset?.uri);
  const images = [];
  let done = 0;

  for (const asset of queue) {
    const uploaded = await uploadListingImage(asset.uri, asset);
    images.push(uploaded.image_url);
    done += 1;
    onProgress?.({ done, total: queue.length });
  }

  return createListing({ ...payload, images });
}

export async function createListing({
  title,
  description,
  price,
  type,
  category,
  condition,
  location,
  images = [],
}) {
  const communityId = await getCommunityId();
  const body = {
    title: title?.trim(),
    description: description?.trim() ?? "",
    price,
    type: normalizeListingType(type),
    images,
  };
  if (communityId) body.community_id = communityId;
  if (category?.trim()) body.category = category.trim();
  if (condition?.trim()) body.condition = condition.trim();
  if (location?.trim()) body.location = location.trim();

  const res = await apiRequest("/listings", {
    method: "POST",
    body,
  });
  return res.data;
}

export async function updateListing(id, payload) {
  const res = await apiRequest(`/listings/${id}`, {
    method: "PATCH",
    body: payload,
  });
  return res;
}

export async function markListingSold(id) {
  const res = await apiRequest(`/listings/${id}/mark-sold`, { method: "PATCH" });
  return res;
}

/** Upload new photos and PATCH an existing listing. */
export async function updateListingWithImages(id, photoAssets, payload, { onProgress } = {}) {
  const newAssets = photoAssets.filter((asset) => asset?.uri && !asset.existing);
  const existingUrls = photoAssets
    .filter((asset) => asset.existing && asset.uri)
    .map((asset) => asset.uri);

  const uploaded = [];
  let done = 0;

  for (const asset of newAssets) {
    const result = await uploadListingImage(asset.uri, asset);
    uploaded.push(result.image_url);
    done += 1;
    onProgress?.({ done, total: newAssets.length });
  }

  const images = [...existingUrls, ...uploaded];

  return updateListing(id, { ...payload, images });
}

export async function deleteListing(id) {
  await apiRequest(`/listings/${id}`, { method: "DELETE" });
}

export async function toggleSaveListing(id) {
  const res = await apiRequest(`/listings/${id}/save`, { method: "POST" });
  return res?.data ?? res;
}
