import { fetchRegions, searchCommunities } from "./auth-api";

/** Map API region payload to the shape used by the region onboarding screen. */
export function normalizeRegion(item) {
  if (!item || typeof item !== "object") return null;
  return {
    type: "region",
    id: item.id,
    title: String(item.title ?? "").trim(),
    area: String(item.area ?? "").trim(),
    state: item.state ? String(item.state).trim() : "",
    users: item.users_label || item.users || "0 users",
    sortOrder: Number(item.sort_order) || 0,
  };
}

/** Map approved community as a top-level listing item (same list as regions). */
export function normalizeCommunityListing(item) {
  if (!item || typeof item !== "object") return null;
  const regionTitle = item.region_title ? String(item.region_title).trim() : "";
  const area = String(item.area ?? item.address ?? "").trim();
  const state = item.state ? String(item.state).trim() : "";

  return {
    type: "community",
    id: item.id,
    title: String(item.title ?? item.name ?? "").trim(),
    area,
    state,
    regionId: item.region_id ?? null,
    regionTitle,
    users: item.users_label || item.users || "0 members",
    subtitle: [area, regionTitle, state].filter(Boolean).join(" · "),
  };
}

export function normalizeDiscoveryItem(item) {
  if (!item || typeof item !== "object") return null;
  if (item.type === "community") return normalizeCommunityListing(item);
  return normalizeRegion({ ...item, type: "region" });
}

/** Fetch regions + approved communities from GET /v1/regions. */
export async function fetchRegionsList({ q } = {}) {
  const data = await fetchRegions(q ? { q } : {});
  if (!Array.isArray(data)) return [];
  return data.map(normalizeDiscoveryItem).filter(Boolean);
}

/** Active regions only — for region picker and step-one onboarding. */
export async function fetchRegionsOnly({ q } = {}) {
  const list = await fetchRegionsList({ q });
  return list.filter((item) => item.type === "region");
}

/** Map community search API payload to onboarding card shape. */
export function normalizeCommunitySearch(item) {
  if (!item || typeof item !== "object") return null;
  const area = String(item.address ?? "").trim();
  return {
    type: "community",
    id: item.id,
    title: String(item.name ?? "").trim(),
    area,
    address: area,
    regionId: item.region_id ?? null,
    regionTitle: item.region ? String(item.region).trim() : "",
    users: "Join community",
    hasAdmin: Boolean(item.has_admin),
  };
}

/** Communities in a region via GET /v1/communities/search. */
export async function fetchCommunitiesInRegion({ regionId, q } = {}) {
  const data = await searchCommunities({ regionId, q });
  if (!Array.isArray(data)) return [];
  return data.map(normalizeCommunitySearch).filter(Boolean);
}
