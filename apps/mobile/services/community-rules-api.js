import { apiRequest } from "./api-client";

/** GET /v1/community-rules — resident view */
export async function fetchCommunityRules() {
  const res = await apiRequest("/community-rules");
  return {
    rules:          res.data ?? [],
    categories:     res.categories ?? [],
    unacknowledged: res.unacknowledged ?? 0,
  };
}

/** POST /v1/community-rules/{id}/acknowledge */
export async function acknowledgeRule(id) {
  const res = await apiRequest(`/community-rules/${id}/acknowledge`, { method: "POST" });
  return res;
}

/** GET /v1/admin/community-rules — admin view */
export async function fetchAdminCommunityRules(params = {}) {
  const p = new URLSearchParams();
  if (params.status && params.status !== "all") p.set("status", params.status);
  if (params.category) p.set("category", params.category);
  if (params.search?.trim()) p.set("search", params.search.trim());
  const res = await apiRequest(`/admin/community-rules?${p.toString()}`);
  return {
    rules:      res.data ?? [],
    categories: res.categories ?? [],
    total:      res.total ?? 0,
  };
}

/** POST /v1/admin/community-rules */
export async function createCommunityRule(payload) {
  const res = await apiRequest("/admin/community-rules", { method: "POST", body: payload });
  return res.data;
}

/** PATCH /v1/admin/community-rules/{id} */
export async function updateCommunityRule(id, payload) {
  const res = await apiRequest(`/admin/community-rules/${id}`, { method: "PATCH", body: payload });
  return res.data;
}

/** DELETE /v1/admin/community-rules/{id} */
export async function deleteCommunityRule(id) {
  await apiRequest(`/admin/community-rules/${id}`, { method: "DELETE" });
}
