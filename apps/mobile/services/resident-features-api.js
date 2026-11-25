import { apiRequest } from "./api-client";

export async function fetchMyResidentFeatures() {
  const res = await apiRequest("/admin/resident-features", { cache: "no-store" });
  return res.data;
}

export async function saveMyResidentFeatures(features, disableReasons) {
  const res = await apiRequest("/admin/resident-features", {
    method: "PUT",
    body: { features, disable_reasons: disableReasons },
  });
  return res.data;
}

export async function enableResidentFeature(featureKey) {
  const res = await apiRequest("/admin/resident-features/enable", {
    method: "POST",
    body: { feature_key: featureKey },
  });
  return res.data;
}

export async function requestFeatureEnable(featureKey, reason) {
  return apiRequest("/admin/resident-features/enable-requests", {
    method: "POST",
    body: { feature_key: featureKey, reason },
  });
}

export async function requestFeatureDisable(featureKey, reason) {
  const res = await apiRequest("/admin/resident-features/disable-requests", {
    method: "POST",
    body: { feature_key: featureKey, reason },
  });
  return res;
}
