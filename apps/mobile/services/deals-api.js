import { apiRequest } from "./api-client";
import { getCommunityId, getToken } from "./auth-session";
import { API_BASE_URL } from "../constants/api-config";
import { resolveMediaUrl } from "../utils/profile-display";
import { guessImageMeta, uploadMultipartFile, persistUploadAsset } from "../utils/upload-form-data";
import { HOME_SECTION_CARD_LIMIT } from "../constants/home-sections";
import i18n from "../i18n";
import { getLocaleForLang } from "../hooks/use-app-locale";

/** GET /v1/deals — browse active deals */
export async function fetchDeals({ type, search, businessId, page = 1, perPage = 20, includeExpired = false } = {}) {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (type && type !== "all") params.set("type", type);
  if (search?.trim()) params.set("search", search.trim());
  if (businessId) params.set("business_id", String(businessId));
  if (includeExpired) params.set("include_expired", "1");
  const res = await apiRequest(`/deals?${params.toString()}`);
  return {
    deals: (res.data ?? []).map(normalizeDeal),
    meta: res.meta ?? {},
  };
}

/** Active deals for a specific business profile. */
export async function fetchBusinessDeals(businessId, { page = 1, perPage = 50 } = {}) {
  return fetchDeals({ businessId, page, perPage });
}

/** GET /v1/deals?scope=manage — admin sees all, resident sees own */
export async function fetchManageDeals({ status, search, page = 1, perPage = 50 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    scope: "manage",
  });
  if (status && status !== "all") params.set("status", status);
  if (search?.trim()) params.set("search", search.trim());
  const res = await apiRequest(`/deals?${params.toString()}`);
  return {
    deals: (res.data ?? []).map(normalizeDeal),
    meta: res.meta ?? {},
  };
}

/** GET /v1/deals/{id} */
export async function fetchDeal(id) {
  const res = await apiRequest(`/deals/${id}`);
  return normalizeDeal(res.data);
}

export async function createDeal(payload, { asAdmin = false } = {}) {
  const communityId = await getCommunityId();
  const body = { ...payload };
  if (communityId) body.community_id = communityId;
  const path = asAdmin ? "/admin/deals" : "/deals";
  const res = await apiRequest(path, { method: "POST", body });
  return normalizeDeal(res.data);
}

export async function updateDeal(id, payload, { asAdmin = false } = {}) {
  const path = asAdmin ? `/admin/deals/${id}` : `/deals/${id}`;
  const res = await apiRequest(path, { method: "PATCH", body: payload });
  return normalizeDeal(res.data);
}

export async function deleteDeal(id, { asAdmin = false } = {}) {
  const path = asAdmin ? `/admin/deals/${id}` : `/deals/${id}`;
  await apiRequest(path, { method: "DELETE" });
}

export async function uploadDealImage(uri, assetMeta = {}, { asAdmin = false } = {}) {
  const token = await getToken();
  if (!token) throw new Error(i18n.t("deals.signInToUpload"));

  const { mimeType } = guessImageMeta(uri, assetMeta, "deal-cover");
  const uploadPath = asAdmin ? "/admin/deals/upload-image" : "/deals/upload-image";
  const body = await uploadMultipartFile({
    url: `${API_BASE_URL}${uploadPath}`,
    uri,
    fieldName: "image",
    token,
    mimeType,
  });

  const imageUrl = resolveMediaUrl(body?.data?.image_url);
  if (!imageUrl) throw new Error(i18n.t("deals.uploadFailed"));
  return { image_url: imageUrl };
}

/** Upload deal image, then create the deal. */
export async function publishDealWithImage(coverImage, payload, { asAdmin = false } = {}) {
  if (!coverImage?.uri) {
    throw new Error(i18n.t("deals.imageRequired"));
  }

  const prepared = coverImage.uploadPrepared
    ? coverImage
    : await persistUploadAsset(coverImage, "deal-cover");

  const uploaded = await uploadDealImage(prepared.uri, prepared, { asAdmin });
  return createDeal({ ...payload, image_url: uploaded.image_url }, { asAdmin });
}

/** Shape API deals into the fields the existing deal cards/detail expect. */
export function normalizeDeal(d) {
  if (!d) return null;
  return {
    id: d.id,
    createdBy: d.created_by ?? null,
    businessId: d.business_id ?? null,
    title: d.title,
    title_es: d.title_es ?? null,
    title_ar: d.title_ar ?? null,
    vendor: d.vendor || d.title,
    description: d.description ?? "",
    description_es: d.description_es ?? null,
    description_ar: d.description_ar ?? null,
    type: d.type ?? "deal",
    category: d.category || "Other",
    offerTag: d.discount_label || "",
    offerTag_es: d.discount_label_es || "",
    offerTag_ar: d.discount_label_ar || "",
    promoCode: d.promo_code ?? null,
    originalPrice: d.original_price ?? null,
    discountedPrice: d.discounted_price ?? null,
    location: d.location ?? "",
    distance: d.location ?? "",
    validUntil: formatValidUntil(d.ends_at),
    endsAt: d.ends_at,
    createdAt: d.created_at ?? null,
    isTrending: !!d.is_featured,
    isExpired: !!d.is_expired,
    isLiked: !!(d.is_liked ?? d.is_saved),
    status: d.status,
    statusLabel: dealStatusLabel(d.status, d.is_expired),
    imageUrl: resolveMediaUrl(d.image_url) ?? d.image_url ?? null,
    imageKey: "food-bowl",
  };
}

/** POST /v1/deals/{id}/save — toggle heart/favorite */
export async function toggleSaveDeal(id) {
  const res = await apiRequest(`/deals/${id}/save`, { method: "POST" });
  return res?.data ?? res;
}

function dealStatusLabel(status, isExpired) {
  if (isExpired || status === "expired") return i18n.t("deals.expired");
  if (status === "active") return i18n.t("deals.active");
  if (status === "inactive") return i18n.t("deals.inactive");
  return status ?? i18n.t("deals.unknown");
}

/** True when a deal should be hidden from the home screen only. */
export function isDealExpiredForHome(deal) {
  if (!deal) return false;
  if (deal.isExpired) return true;

  const endsAt = deal.endsAt ?? deal.ends_at;
  if (!endsAt) return false;

  const end = new Date(String(endsAt).replace(" ", "T"));
  return !Number.isNaN(end.getTime()) && end < new Date();
}

/** Active deals for home carousel — featured first, then newest; list screens unchanged. */
export function pickActiveDealsForHome(deals, limit = HOME_SECTION_CARD_LIMIT) {
  return (deals ?? [])
    .filter((deal) => !isDealExpiredForHome(deal))
    .sort((a, b) => {
      const aFeatured = a.isTrending ? 1 : 0;
      const bFeatured = b.isTrending ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;

      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

function formatValidUntil(endsAt) {
  if (!endsAt) return "";
  const date = new Date(String(endsAt).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(getLocaleForLang(i18n.language), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
