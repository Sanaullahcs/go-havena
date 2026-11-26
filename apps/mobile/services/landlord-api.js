import { apiRequest } from "./api-client";
import { getCommunityId } from "./auth-session";

export async function fetchLandlordAccess(communityId) {
  const cid = communityId ?? (await getCommunityId());
  const qs = cid ? `?community_id=${encodeURIComponent(String(cid))}` : "";
  const res = await apiRequest(`/landlord/access${qs}`);
  return res.data ?? {};
}

export async function fetchLandlordPortfolio(communityId) {
  const cid = communityId ?? (await getCommunityId());
  const qs = cid ? `?community_id=${encodeURIComponent(String(cid))}` : "";
  const res = await apiRequest(`/landlord/portfolio${qs}`);
  return { data: res.data ?? {}, meta: res.meta ?? {} };
}

export async function claimLandlordOwnership({ unit_number, is_new_unit, occupancy, community_id, proof_url }) {
  const body = {
    unit_number,
    is_new_unit: Boolean(is_new_unit),
    occupancy,
    proof_url,
    community_id: community_id ?? (await getCommunityId()),
  };
  const res = await apiRequest("/landlord/ownership-claims", { method: "POST", body });
  return res.data ?? res;
}

export async function decideLandlordAdvisory(id, status, reason) {
  const res = await apiRequest(`/landlord/advisory-reviews/${id}`, {
    method: "POST",
    body: { status, reason },
  });
  return res.data ?? res;
}

export function occupancyLabelKey(occupancy) {
  const key = String(occupancy || "").toLowerCase();
  if (key === "live_here") return "landlord.occupancyLiveHere";
  if (key === "rented") return "landlord.occupancyRented";
  if (key === "vacant") return "landlord.occupancyVacant";
  return "landlord.occupancyOther";
}