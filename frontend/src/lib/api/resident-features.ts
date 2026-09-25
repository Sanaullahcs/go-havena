import api from "./client";
import type { ResidentFeaturesPayload } from "@/lib/resident-features";

export async function fetchMyResidentFeatures(): Promise<ResidentFeaturesPayload> {
  const res = await api.get("/v1/admin/resident-features");
  return res.data.data as ResidentFeaturesPayload;
}

export async function saveMyResidentFeatures(
  features: Record<string, boolean>,
): Promise<ResidentFeaturesPayload> {
  const res = await api.put("/v1/admin/resident-features", { features });
  return res.data.data as ResidentFeaturesPayload;
}

export async function fetchCommunityResidentFeatures(
  communityId: number,
): Promise<ResidentFeaturesPayload> {
  const res = await api.get(`/v1/admin/communities/${communityId}/resident-features`);
  return res.data.data as ResidentFeaturesPayload;
}

export async function saveCommunityResidentFeatures(
  communityId: number,
  features: Record<string, boolean>,
): Promise<ResidentFeaturesPayload> {
  const res = await api.put(`/v1/admin/communities/${communityId}/resident-features`, { features });
  return res.data.data as ResidentFeaturesPayload;
}
