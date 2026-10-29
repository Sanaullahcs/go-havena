import { apiRequest } from "./api-client";
import { getToken, getUser, setCommunityId } from "./auth-session";
import { canSwitchModes } from "./community-access";
import { beginMeSync, commitMeSync, syncUserFromApi } from "./auth-api";
import { API_BASE_URL } from "../constants/api-config";
import { getProfileFields, resolveMediaUrl } from "../utils/profile-display";
import { guessImageMeta, normalizeUploadAsset, uploadMultipartFile } from "../utils/upload-form-data";
import { clearWellnessHubCache } from "./wellness-api";
import { invalidateBillsSummary } from "../hooks/use-bills-summary";
import i18n from "../i18n";

function clearCommunityScopedCaches() {
  clearWellnessHubCache();
  invalidateBillsSummary();
}

function normalizeMe(data) {
  if (!data) return null;
  const fields = getProfileFields(data);
  const { role: displayRole, ...displayFields } = fields;
  return {
    ...data,
    ...displayFields,
    role: data.role ?? "resident",
    displayRole,
  };
}

export async function fetchMe({ inviteCommunityId } = {}) {
  const seq = beginMeSync();
  const query = inviteCommunityId
    ? `?invite_community_id=${encodeURIComponent(inviteCommunityId)}`
    : "";
  const res = await apiRequest(`/me${query}`, { community: false, cache: "no-store" });
  const data = await commitMeSync(seq, res.data);
  return normalizeMe(data);
}

export async function fetchMyCommunities() {
  const res = await apiRequest("/me/communities", { community: false, cache: "no-store" });
  return {
    communities: res.data ?? [],
    activeCommunityId: res.meta?.active_community_id ?? null,
  };
}

export async function fetchMyInvitations() {
  const res = await apiRequest("/me/invitations", { community: false, cache: "no-store" });
  return res.data ?? [];
}

export async function rejectMyInvitation(inviteId) {
  const res = await apiRequest(`/me/invitations/${inviteId}/reject`, {
    method: "POST",
    community: false,
  });
  if (res.data?.user) {
    await syncUserFromApi(res.data.user);
  }
  return res;
}

export async function switchActiveContext(context, communityId) {
  const user = await getUser();
  if (!canSwitchModes(user)) {
    const err = new Error("Only a Community Admin can switch modes.");
    err.code = "MODE_SWITCH_NOT_ALLOWED";
    throw err;
  }
  const res = await apiRequest("/me/active-context", {
    method: "PUT",
    community: false,
    body: {
      context,
      active_mode: context,
      community_id: communityId || undefined,
    },
  });
  await syncUserFromApi(res.data);
  const nextCommunityId = res.data?.active_context_community_id ?? communityId;
  if (nextCommunityId) {
    await setCommunityId(nextCommunityId);
  }
  clearCommunityScopedCaches();
  return normalizeMe((await getUser()) ?? res.data);
}

export async function switchActiveCommunity(communityId) {
  const res = await apiRequest("/me/active-context", {
    method: "PUT",
    community: false,
    body: { community_id: communityId },
  });
  await syncUserFromApi(res.data);
  const nextCommunityId = res.data?.active_context_community_id ?? communityId;
  if (nextCommunityId) {
    await setCommunityId(nextCommunityId);
  }
  clearCommunityScopedCaches();
  return normalizeMe((await getUser()) ?? res.data);
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
    isBlocked: Boolean(data.is_blocked),
    canBlock: data.can_block === true && !data.is_mine,
    canReport: data.can_report === true && !data.is_mine,
    accountRole: data.account_role ?? null,
    role: data.role ?? data.account_role ?? null,
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
