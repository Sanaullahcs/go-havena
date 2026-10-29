import { getCommunityId, getToken, getUser, setCommunityId } from "./auth-session";
import { fetchMe } from "./auth-api";

function isActiveApprovedMembership(membership) {
  if (membership?.status !== "approved") return false;

  const community = membership.community;
  if (!community) return true;

  if (community.review_status === "pending" || community.review_status === "rejected") {
    return false;
  }

  if (community.status && community.status !== "active") {
    return false;
  }

  return true;
}

function pickApprovedCommunityId(user, storedId = null) {
  const approved = (user?.memberships ?? []).filter(isActiveApprovedMembership);
  if (!approved.length) return null;

  const preferred = user?.active_context_community_id;
  if (preferred && approved.some((m) => String(m.community_id) === String(preferred))) {
    return Number(preferred);
  }

  if (storedId && approved.some((m) => String(m.community_id) === String(storedId))) {
    return Number(storedId);
  }

  return approved[0]?.community_id ?? null;
}

/**
 * Resolve the approved community used for feed requests.
 * Returns all neighbors' posts in that community — not just the current user's.
 */
export async function ensureFeedCommunityContext() {
  const token = await getToken();
  if (!token || token === "dev-offline-token") {
    return null;
  }

  const storedId = await getCommunityId();
  if (storedId) {
    return storedId;
  }

  const cachedUser = await getUser();
  const cachedId = pickApprovedCommunityId(cachedUser, null);
  if (cachedId) {
    await setCommunityId(cachedId);
    return cachedId;
  }

  try {
    const fresh = await fetchMe();
    const communityId = pickApprovedCommunityId(fresh, null);
    if (communityId) {
      await setCommunityId(communityId);
      return communityId;
    }
    await setCommunityId(null);
    return null;
  } catch {
    return null;
  }
}
