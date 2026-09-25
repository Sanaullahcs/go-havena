import { apiRequest } from "./api-client";

export async function fetchMyResidentFeatures() {
  const res = await apiRequest("/admin/resident-features");
  return res.data;
}

export async function saveMyResidentFeatures(features) {
  const res = await apiRequest("/admin/resident-features", {
    method: "PUT",
    body: { features },
  });
  return res.data;
}
