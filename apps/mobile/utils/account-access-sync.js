import { getUser, patchCachedUser } from "../services/auth-session";
import {
  createLocalAccountRestrictedError,
  isAccountRestrictedError,
  isUserLocallyRestricted,
} from "./guest-permission-errors";

export { isAccountRestrictedError, isUserLocallyRestricted };

/** Persist suspension/restriction from an API error onto the cached session user. */
export async function syncAccountRestrictionFromError(error) {
  if (!isAccountRestrictedError(error)) return null;

  const user = await getUser({ reload: true });
  if (!user) return null;

  const suspendedAt =
    error?.suspendedAt ??
    error?.suspended_at ??
    user.restricted_at ??
    user.updated_at ??
    null;

  const memberships = (user.memberships ?? []).map((membership) => {
    if (error.code !== "ACCOUNT_SUSPENDED" && error.code !== "COMMUNITY_DEACTIVATED") {
      return membership;
    }
    if (String(membership.status ?? "").toLowerCase() === "approved") {
      return { ...membership, status: "banned" };
    }
    return membership;
  });

  return patchCachedUser({
    status: error.code === "COMMUNITY_DEACTIVATED" ? user.status : "suspended",
    memberships,
    restricted_at: suspendedAt,
  });
}

/** Resolve a restriction error before/after a screen load attempt. */
export async function resolveLoadRestriction(feature, apiError = null) {
  if (apiError) {
    if (isAccountRestrictedError(apiError)) {
      await syncAccountRestrictionFromError(apiError);
      return { ...apiError, feature: apiError.feature ?? feature };
    }

    if (apiError?.status === 401) {
      const user = await getUser({ reload: true });
      if (isUserLocallyRestricted(user)) {
        return createLocalAccountRestrictedError(user, feature);
      }
    }

    return null;
  }

  const user = await getUser({ reload: true });
  if (isUserLocallyRestricted(user)) {
    return createLocalAccountRestrictedError(user, feature);
  }

  return null;
}
