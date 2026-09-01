import { apiRequest } from "./api-client";
import { getToken } from "./auth-session";
import { syncUserFromApi } from "./auth-api";
import { API_BASE_URL } from "../constants/api-config";
import { getProfileFields, resolveMediaUrl } from "../utils/profile-display";
import { guessImageMeta, normalizeUploadAsset, uploadMultipartFile } from "../utils/upload-form-data";
import i18n from "../i18n";

function normalizeMe(data) {
  if (!data) return null;
  return {
    ...data,
    ...getProfileFields(data),
  };
}

export async function fetchMe() {
  const res = await apiRequest("/me", { community: false });
  await syncUserFromApi(res.data);
  return normalizeMe(res.data);
}

/** GET /v1/neighbors/{id} — another resident in the same community */
export async function fetchNeighbor(userId) {
  const res = await apiRequest(`/neighbors/${userId}`);
  const data = res.data ?? null;
  if (!data) return null;
  return {
    ...data,
    avatar_url: resolveMediaUrl(data.avatar_url),
    displayName: data.display_name || data.name || "Neighbor",
    avatarUrl: resolveMediaUrl(data.avatar_url),
    unitNumber: data.unit_number ?? null,
    communityName: data.community_name ?? null,
    bio: data.bio ?? "",
  };
}

/** Open own profile or another resident's public community profile. */
export function openNeighborProfile(router, { userId, isMine } = {}) {
  if (!userId || !router) return;
  if (isMine) {
    router.push("/(tabs)/profile");
    return;
  }
  router.push({
    pathname: "/screens/resident-profile",
    params: { userId: String(userId) },
  });
}

export async function updateMe(payload) {
  const res = await apiRequest("/me", {
    method: "POST",
    body: payload,
    community: false,
  });
  await syncUserFromApi(res.data);
  return normalizeMe(res.data);
}

export async function uploadAvatar(uri, assetMeta = {}) {
  const token = await getToken();
  if (!token) {
    throw new Error(i18n.t("imagePicker.signInRequired"));
  }

  const { mimeType } = guessImageMeta(uri, assetMeta, "avatar");

  const body = await uploadMultipartFile({
    url: `${API_BASE_URL}/me/avatar`,
    uri,
    fieldName: "avatar",
    token,
    mimeType,
    assetMeta,
  });

  const avatarUrl = resolveMediaUrl(body?.data?.avatar_url);
  const refreshed = await fetchMe();

  return {
    ...body,
    data: {
      ...(body.data ?? {}),
      avatar_url: avatarUrl ?? refreshed?.avatarUrl ?? null,
    },
  };
}

export async function uploadUtilityBill(uri, assetMeta = {}) {
  const token = await getToken();
  if (!token) {
    throw new Error(i18n.t("imagePicker.signInRequired"));
  }

  const normalized = normalizeUploadAsset(
    { uri, ...assetMeta },
    "utility-bill",
  );

  const body = await uploadMultipartFile({
    url: `${API_BASE_URL}/me/utility-bill`,
    uri: normalized.uri,
    fieldName: "utility_bill",
    token,
    mimeType: normalized.mimeType,
    assetMeta: normalized,
  });

  const utilityBillUrl = resolveMediaUrl(body?.data?.utility_bill_url);
  const refreshed = await fetchMe();

  return {
    ...body,
    data: {
      ...(body.data ?? {}),
      utility_bill_url: utilityBillUrl ?? refreshed?.utilityBillUrl ?? null,
    },
  };
}

export async function changePassword({ current_password, new_password }) {
  const res = await apiRequest("/me/password", {
    method: "PUT",
    body: { current_password, new_password, new_password_confirmation: new_password },
    community: false,
  });
  return res.data;
}
