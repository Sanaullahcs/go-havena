import { getCommunityId, getToken, getUser, setCommunityId } from "./auth-session";
import { fetchMe } from "./auth-api";
import { isMockApiActive, MOCK_COMMUNITY_ID } from "../constants/mock-config";
import { MOCK_DEMO_TOKEN, DEV_OFFLINE_TOKEN } from "../constants/api-config";

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

  if (storedId && approved.some((m) => m.community_id === storedId)) {
    return storedId;
  }

  return approved[0]?.community_id ?? null;
}

/**
 * Resolve the approved community used for feed requests.
 * Returns all neighbors' posts in that community — not just the current user's.
 */
export async function ensureFeedCommunityContext() {
  const token = await getToken();
  if (!token) {
    return null;
  }

  const storedId = await getCommunityId();

  if (token === DEV_OFFLINE_TOKEN) {
    return null;
  }

  if (token === MOCK_DEMO_TOKEN || isMockApiActive(token)) {
    const user = await getUser();
    const communityId =
      pickApprovedCommunityId(user, storedId) ??
      (storedId ? Number(storedId) : null) ??
      MOCK_COMMUNITY_ID;
    await setCommunityId(communityId);
    return communityId;
  }

  try {
    const fresh = await fetchMe();
    const communityId = pickApprovedCommunityId(fresh, storedId);
    if (communityId) {
      await setCommunityId(communityId);
      return communityId;
    }
    await setCommunityId(null);
    return null;
  } catch {
    const user = await getUser();
    const communityId = pickApprovedCommunityId(user, storedId);
    if (communityId) {
      await setCommunityId(communityId);
      return communityId;
    }

    if (storedId) {
      await setCommunityId(null);
    }
    return null;
  }
}
