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

  const shouldMarkBanned = error.code === "ACCOUNT_SUSPENDED" || error.code === "COMMUNITY_DEACTIVATED";
  const approvedIds = (user.memberships ?? [])
    .filter((membership) => String(membership.status ?? "").toLowerCase() === "approved")
    .map((membership) => membership.community_id);
  const currentId = user.active_context_community_id ?? null;
  const currentIsApproved = Boolean(
    currentId && approvedIds.some((id) => String(id) === String(currentId)),
  );
  const targetId = currentIsApproved
    ? currentId
    : !currentId && approvedIds.length === 1
      ? approvedIds[0]
      : null;

  const memberships = (user.memberships ?? []).map((membership) => {
    if (!shouldMarkBanned) return membership;
    if (!targetId || String(membership.community_id) !== String(targetId)) return membership;
    if (String(membership.status ?? "").toLowerCase() !== "approved") return membership;
    return { ...membership, status: "banned" };
  });

  const hasApproved = memberships.some(
    (membership) => String(membership.status ?? "").toLowerCase() === "approved",
  );

  return patchCachedUser({
    status:
      error.code === "COMMUNITY_DEACTIVATED"
        ? user.status
        : hasApproved
          ? "active"
          : "suspended",
    memberships,
    restricted_at: suspendedAt,
    active_context_community_id: hasApproved
      ? memberships.find((membership) => String(membership.status ?? "").toLowerCase() === "approved")
          ?.community_id ?? user.active_context_community_id
      : user.active_context_community_id,
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
