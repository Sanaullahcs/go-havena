import api from "./client";
import type { FeatureDisableRequest, ResidentFeaturesPayload } from "@/lib/resident-features";

export async function fetchMyResidentFeatures(): Promise<ResidentFeaturesPayload> {
  const res = await api.get("/v1/admin/resident-features", {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    params: { _: Date.now() },
  });
  return res.data.data as ResidentFeaturesPayload;
}

export async function saveMyResidentFeatures(
  features: Record<string, boolean>,
  disableReasons?: Record<string, string>,
): Promise<ResidentFeaturesPayload> {
  const res = await api.put("/v1/admin/resident-features", {
    features,
    disable_reasons: disableReasons,
  });
  return res.data.data as ResidentFeaturesPayload;
}

export async function enableResidentFeature(featureKey: string): Promise<ResidentFeaturesPayload> {
  const res = await api.post("/v1/admin/resident-features/enable", {
    feature_key: featureKey,
  });
  return res.data.data as ResidentFeaturesPayload;
}

export async function requestFeatureEnable(
  featureKey: string,
  reason: string,
): Promise<{ request: FeatureDisableRequest; features: ResidentFeaturesPayload }> {
  const res = await api.post("/v1/admin/resident-features/enable-requests", {
    feature_key: featureKey,
    reason,
  });
  return {
    request: res.data.data as FeatureDisableRequest,
    features: res.data.features as ResidentFeaturesPayload,
  };
}

export async function requestFeatureDisable(
  featureKey: string,
  reason: string,
): Promise<{ request: FeatureDisableRequest; features: ResidentFeaturesPayload }> {
  const res = await api.post("/v1/admin/resident-features/disable-requests", {
    feature_key: featureKey,
    reason,
  });
  return {
    request: res.data.data as FeatureDisableRequest,
    features: res.data.features as ResidentFeaturesPayload,
  };
}

export async function fetchFeatureDisableRequests(
  status = "pending",
): Promise<FeatureDisableRequest[]> {
  const res = await api.get("/v1/admin/feature-disable-requests", {
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    params: { status, _: Date.now() },
  });
  return (res.data.data ?? []) as FeatureDisableRequest[];
}

export async function reviewFeatureDisableRequest(
  id: number,
  decision: "approve" | "reject",
): Promise<FeatureDisableRequest> {
  const res = await api.post(`/v1/admin/feature-disable-requests/${id}/${decision}`);
  return res.data.data as FeatureDisableRequest;
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
