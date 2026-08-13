import { apiRequest, ApiError } from "./api-client";
import { canAccessDashboard } from "./community-access";
import { setCommunityId, setSession, clearSession, getToken, getUser } from "./auth-session";
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
}

export async function syncUserFromApi(data) {
  return syncSessionFromMe(data);
}

export async function requestOtp(phone, { intent = "login" } = {}) {
  const normalized = normalizePhone(phone);
  const body = { phone: normalized, intent };

  // Always hit the API so an OTP record exists before verify (dev code 123456 in local env).
  return apiRequest("/auth/otp/request", {
    method: "POST",
    body,
    auth: false,
    community: false,
  });
}

export async function verifyOtp(phone, code, { intent = "login", role = "resident", password, passwordConfirmation } = {}) {
  const normalized = normalizePhone(phone);
  const payload = {
    phone: normalized,
    code: String(code).replace(/\D/g, ""),
    intent,
  };

  if (intent === "signup") {
    payload.role = role;
    if (password) {
      payload.password = password;
      payload.password_confirmation = passwordConfirmation ?? password;
    }
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

  const approved = result.user?.memberships?.find((m) => m.status === "approved");
  if (approved?.community_id) {
    await setCommunityId(approved.community_id);
  }

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

  const adminMembership = result.user?.memberships?.find(
    (m) => m.status === "approved" && ["admin", "moderator"].includes(m.role),
  );
  const approved = adminMembership ?? result.user?.memberships?.find((m) => m.status === "approved");
  if (approved?.community_id) {
    await setCommunityId(approved.community_id);
  }

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
  // Keep unlock credentials so fingerprint / Face ID work without phone OTP again
  await clearSession({ keepBiometricUnlock: true });
}

export async function fetchMe() {
  const result = await apiRequest("/me", { community: false });
  await syncSessionFromMe(result.data);
  const approved = result.data?.memberships?.find((m) => m.status === "approved");
  const adminMembership = result.data?.memberships?.find(
    (m) => m.status === "approved" && ["admin", "moderator"].includes(m.role),
  );
  const communityMembership = adminMembership ?? approved;
  if (communityMembership?.community_id) {
    await setCommunityId(communityMembership.community_id);
  }
  return result.data;
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
      method: "PUT",
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

export async function requestCommunity({ communityName, address, regionId }) {
  try {
    const result = await apiRequest("/communities/request", {
      method: "POST",
      body: {
        community_name: communityName,
        address,
        region_id: regionId,
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

export async function fetchRegions({ q } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
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
  const profile = user?.profile;
  return Boolean(
    profile?.display_name?.trim() &&
      profile?.unit_number?.trim() &&
      profile?.residence_type,
  );
}
