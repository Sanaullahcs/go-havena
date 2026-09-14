import { apiRequest, ApiError } from "./api-client";
import { canAccessDashboard, isCommunityAdminRole, isGuestUser } from "./community-access";
import { getCommunityId, setCommunityId, setSession, clearSession, getToken, getUser } from "./auth-session";
import { getPrimaryMembership } from "./community-access";
import { clearNearbyPlacesCache } from "./nearby-places-api";
import { unregisterPushDeviceOnSignOut } from "./push-notifications";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { toE164, extractNationalDigits } from "../utils/phone";
import { paramString } from "../utils/route-params";
import { DEV_OFFLINE_TOKEN } from "../constants/api-config";

function normalizePhone(input) {
  let raw = paramString(input).trim();
  if (!raw) return raw;

  // Query / route decoding can turn "+" into a leading space.
  if (/^\s+\d/.test(raw)) {
    raw = `+${raw.trim()}`;
  }

  const parsed = parsePhoneNumberFromString(raw);
  if (parsed?.number) return parsed.number;

  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly) {
    const withPlus = parsePhoneNumberFromString(`+${digitsOnly}`);
    if (withPlus?.number) return withPlus.number;
  }

  const e164 = toE164(extractNationalDigits(raw));
  return e164 || raw;
}

async function isDevOfflineSession() {
  return __DEV__ && (await getToken()) === DEV_OFFLINE_TOKEN;
}

function devMockCommunityJoin(communityName = "Oak Valley Residences") {
  return {
    membership: { id: 0, community_id: 3, role: "member", status: "approved" },
    community: { id: 3, name: communityName, region: "Local" },
  };
}

async function applyCommunityFromUser(user, { preferStored = false } = {}) {
  const approved = (user?.memberships ?? []).filter((m) => m.status === "approved");
  const stored = await getCommunityId();
  let next = getPrimaryMembership(user);
  if (preferStored && stored) {
    const match = approved.find((m) => String(m.community_id) === String(stored));
    if (match) next = match;
  }
  const nextId = next?.community_id ?? null;
  if (String(nextId ?? "") !== String(stored ?? "")) {
    clearNearbyPlacesCache();
  }
  await setCommunityId(nextId);
  return nextId;
}

async function syncSessionFromMe(data) {
  const token = await getToken();
  if (!token || !data) return;
  const existing = await getUser();
  await setSession({
    token,
    user: {
      id: data.id,
      uuid: data.uuid,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role ?? existing?.role ?? "resident",
      community_admin_status:
        data.community_admin_status ?? existing?.community_admin_status ?? null,
      status: data.status ?? existing?.status ?? "active",
      profile: data.profile ?? existing?.profile ?? null,
      memberships: Array.isArray(data.memberships)
        ? data.memberships
        : (existing?.memberships ?? []),
      access: data.access ?? existing?.access ?? null,
      family: data.family ?? existing?.family ?? null,
    },
  });
  await applyCommunityFromUser(data, { preferStored: true });
}

export async function syncUserFromApi(data) {
  return syncSessionFromMe(data);
}

export async function requestOtp(email, { intent = "login" } = {}) {
  const normalized = String(email ?? "").trim().toLowerCase();
  const body = { email: normalized, intent };

  return apiRequest("/auth/otp/request", {
    method: "POST",
    body,
    auth: false,
    community: false,
  });
}

export async function verifyOtp(email, code, { intent = "login", role = "resident" } = {}) {
  const normalized = String(email ?? "").trim().toLowerCase();
  const payload = {
    email: normalized,
    code: String(code).replace(/\D/g, ""),
    intent,
  };

  if (intent === "signup") {
    payload.role = role;
  }

  const result = await apiRequest("/auth/otp/verify", {
    method: "POST",
    body: payload,
    auth: false,
    community: false,
  });

  await setSession({ token: result.token, user: result.user });

  if (__DEV__) {
    const savedToken = await getToken({ reload: true });
    if (!savedToken) {
      console.warn("[auth] Session token was not persisted to device storage");
    }
  }

  await applyCommunityFromUser(result.user);
  clearNearbyPlacesCache();

  return result;
}

export async function loginWithPhonePassword(phone, password) {
  const normalized = normalizePhone(phone);
  const result = await apiRequest("/auth/login", {
    method: "POST",
    body: { phone: normalized, password },
    auth: false,
    community: false,
  });

  await setSession({ token: result.token, user: result.user });

  await applyCommunityFromUser(result.user);
  clearNearbyPlacesCache();

  return result;
}

/**
 * Sign out of the app UI.
 * Soft by default: keeps the API token for biometric unlock after logout.
 * Pass { revokeServer: true } to invalidate the token on the server.
 */
export async function logout({ revokeServer = false } = {}) {
  if (revokeServer) {
    try {
      await apiRequest("/auth/logout", { method: "POST", community: false });
    } catch {
      // ignore network errors on logout
    }
  }
  // Keep unlock credentials so fingerprint / Face ID work without email OTP again
  await clearSession({ keepBiometricUnlock: true });
  clearNearbyPlacesCache();
}

/** Permanently delete the signed-in account, then wipe local session. */
export async function deleteAccount() {
  try {
    await unregisterPushDeviceOnSignOut();
  } catch {
    // continue even if push unregister fails
  }
  await apiRequest("/me", { method: "DELETE", community: false });
  await clearSession({ keepBiometricUnlock: false });
  clearNearbyPlacesCache();
}

export async function fetchMe() {
  const result = await apiRequest("/me", { community: false });
  await syncSessionFromMe(result.data);
  return result.data;
}

/** One-time code so the in-app browser can open Billing already signed in. */
export async function createWebHandoff() {
  const result = await apiRequest("/auth/web-handoff", {
    method: "POST",
    community: false,
  });
  const code = String(result?.code ?? result?.data?.code ?? "").trim();
  return code || null;
}

/** Poll explicit membership approval status for the onboarding wait screen. */
export async function fetchMembershipReviewStatus() {
  const result = await apiRequest("/me/membership-review", { community: false });
  return result.data ?? null;
}

export async function saveRegionSelection(regionId) {
  const numericId = Number(regionId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null;
  }

  await patchLocalProfile({ region_id: numericId });

  const token = await getToken();
  if (!token) {
    return null;
  }

  try {
    return await updateProfile({ region_id: numericId });
  } catch (err) {
    // Keep the local selection; complete-profile sends region_id again on submit.
    if (__DEV__) {
      console.warn("[auth] Region sync deferred until profile save", err?.message ?? err);
    }
    return null;
  }
}

async function patchLocalProfile(partial) {
  const user = await getUser();
  if (!user) return;
  const token = await getToken();
  await setSession({
    token: token ?? undefined,
    user: {
      ...user,
      profile: {
        ...(user.profile ?? {}),
        ...partial,
      },
    },
  });
}

export async function updateProfile(payload) {
  try {
    const result = await apiRequest("/me", {
      method: "POST",
      body: payload,
      community: false,
    });
    if (!result?.data?.id) {
      throw new ApiError("Unexpected server response. Please try again.", {
        status: 502,
        code: "INVALID_RESPONSE",
      });
    }
    await syncSessionFromMe(result.data);
    return { user: result.data, family: result.family ?? null };
  } catch (err) {
    if (await isDevOfflineSession()) {
      const user = await getUser();
      const next = {
        ...user,
        name: payload.display_name ?? user?.name,
        email: payload.email ?? user?.email,
        profile: {
          ...user?.profile,
          display_name: payload.display_name ?? user?.profile?.display_name ?? "",
          bio: payload.bio ?? user?.profile?.bio ?? "",
          unit_number: payload.unit_number ?? user?.profile?.unit_number ?? "",
          residence_type: payload.residence_type ?? user?.profile?.residence_type ?? null,
          region_id: payload.region_id ?? user?.profile?.region_id ?? null,
        },
      };
      await setSession({ token: DEV_OFFLINE_TOKEN, user: next });
      return next;
    }
    throw err;
  }
}

export async function joinCommunity(communityId, { inviteCode } = {}) {
  const body = inviteCode ? { invite_code: inviteCode } : {};

  try {
    const result = await apiRequest(`/communities/${communityId}/join`, {
      method: "POST",
      body,
      community: false,
    });

    if (result.data?.membership?.status === "approved") {
      await setCommunityId(result.data.community.id);
    }

    const user = await getUser();
    if (user) {
      const memberships = [...(user.memberships ?? [])];
      const idx = memberships.findIndex((m) => m.community_id === result.data.community.id);
      const entry = {
        id: result.data.membership.id,
        community_id: result.data.community.id,
        role: result.data.membership.role,
        status: result.data.membership.status,
        invite_code_used: result.data.membership.invite_code_used ?? inviteCode ?? null,
        community: result.data.community,
      };
      if (idx >= 0) memberships[idx] = entry;
      else memberships.push(entry);
      await setSession({ token: await getToken(), user: { ...user, memberships } });
    }

    if (result.data?.membership?.status === "approved") {
      try {
        await fetchMe();
      } catch {
        // Local session already updated above
      }
    }

    return result.data;
  } catch (err) {
    if (await isDevOfflineSession()) {
      console.warn("[dev] joinCommunity failed — using offline join", err.message ?? err);
      const data = devMockCommunityJoin();
      await setCommunityId(data.community.id);
      return data;
    }
    throw err;
  }
}

export async function joinByInviteCode(inviteCode) {
  try {
    const result = await apiRequest("/communities/join-by-invite", {
      method: "POST",
      body: { invite_code: inviteCode },
      community: false,
    });

    if (result.data?.membership?.status === "approved") {
      await setCommunityId(result.data.community.id);
    }

    if (result.data?.user) {
      await syncSessionFromMe(result.data.user);
    } else {
      const user = await getUser();
      if (user && result.data) {
        const memberships = [...(user.memberships ?? [])];
        const idx = memberships.findIndex((m) => m.community_id === result.data.community.id);
        const entry = {
          id: result.data.membership.id,
          community_id: result.data.community.id,
          role: result.data.membership.role,
          status: result.data.membership.status,
          invite_code_used: result.data.membership.invite_code_used ?? inviteCode ?? null,
          community: result.data.community,
        };
        if (idx >= 0) memberships[idx] = entry;
        else memberships.push(entry);
        await setSession({ token: await getToken(), user: { ...user, memberships } });
      }

      try {
        await fetchMe();
      } catch {
        // Session already updated above when possible.
      }
    }

    return result.data;
  } catch (err) {
    if (await isDevOfflineSession()) {
      const code = inviteCode.trim().toUpperCase();
      if (code.length >= 6) {
        console.warn("[dev] joinByInviteCode failed — using offline join", err.message ?? err);
        const data = devMockCommunityJoin();
        await setCommunityId(data.community.id);
        return data;
      }
    }
    throw err;
  }
}

export async function requestCommunity({ communityName, address, description, regionId, latitude, longitude }) {
  try {
    const token = await getToken();
    if (!token) {
      throw new ApiError("Please sign in again to request a community.", {
        status: 401,
        code: "UNAUTHENTICATED",
      });
    }

    const result = await apiRequest("/communities/request", {
      method: "POST",
      body: {
        community_name: communityName,
        address,
        description: description || undefined,
        region_id: regionId,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
      },
      community: false,
    });

    if (result.data?.user) {
      await syncSessionFromMe(result.data.user);
    } else if (result.data?.membership) {
      const user = await getUser();
      if (user) {
        const memberships = [...(user.memberships ?? [])];
        const entry = {
          id: result.data.membership.id,
          community_id: result.data.membership.community_id,
          role: result.data.membership.role,
          status: result.data.membership.status,
          community: result.data.community,
        };
        const idx = memberships.findIndex((m) => m.community_id === entry.community_id);
        if (idx >= 0) memberships[idx] = entry;
        else memberships.push(entry);
        await setSession({ token: await getToken(), user: { ...user, memberships } });
      }
    }

    return result.data;
  } catch (err) {
    if (await isDevOfflineSession()) {
      console.warn("[dev] requestCommunity failed — using offline request", err.message ?? err);
      return {
        membership: { id: 0, community_id: 0, role: "member", status: "pending" },
        community: {
          id: 0,
          name: communityName,
          region: "Pending Review",
          review_status: "pending",
          status: "inactive",
        },
      };
    }
    throw err;
  }
}

export async function searchCommunities({ q, region, regionId, unassignedOnly } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (regionId) params.set("region_id", String(regionId));
  else if (region) params.set("region", region);
  if (unassignedOnly) params.set("unassigned_only", "1");
  const qs = params.toString();
  const result = await apiRequest(`/communities/search${qs ? `?${qs}` : ""}`, {
    auth: false,
    community: false,
  });
  return result.data;
}

export async function fetchRegions({ q, countryId, stateId } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (countryId) params.set("country_id", String(countryId));
  if (stateId) params.set("state_id", String(stateId));
  const qs = params.toString();
  const result = await apiRequest(`/regions${qs ? `?${qs}` : ""}`, {
    auth: false,
    community: false,
  });
  return result.data;
}

/** True when the user already belongs to an approved community (returning user). */
export function hasApprovedMembership(user) {
  if (user?.role === "community_admin") {
    return canAccessDashboard(user);
  }

  return Boolean(user?.memberships?.some((m) => m.status === "approved"));
}

/** True when profile has the minimum fields needed for home access. */
export function isProfileComplete(user) {
  if (isCommunityAdminRole(user) && typeof user?.access?.profile_complete === "boolean") {
    return user.access.profile_complete;
  }

  const profile = user?.profile;
  if (!profile?.display_name?.trim() || !profile?.unit_number?.trim()) return false;
  if (isGuestUser(user) || isCommunityAdminRole(user)) return true;
  return Boolean(profile?.residence_type);
}
