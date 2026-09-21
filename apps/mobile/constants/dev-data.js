/** Offline onboarding data when the API is unreachable in development builds. */

export const DEV_MOCK_REGIONS = [
  {
    type: "region",
    id: 1,
    title: "Florida - Miami-Dade County",
    area: "Miami-Dade County",
    state: "Florida",
    users_label: "12,450 users",
    users: "12,450 users",
    sort_order: 1,
  },
  {
    type: "region",
    id: 2,
    title: "Florida - Tampa Bay",
    area: "Tampa Bay Area",
    state: "Florida",
    users_label: "8,920 users",
    users: "8,920 users",
    sort_order: 2,
  },
  {
    type: "region",
    id: 5,
    title: "California - Bay Area",
    area: "San Francisco Bay Area",
    state: "California",
    users_label: "15,800 users",
    users: "15,800 users",
    sort_order: 5,
  },
  {
    type: "region",
    id: 11,
    title: "New York - NYC",
    area: "New York City",
    state: "New York",
    users_label: "21,400 users",
    users: "21,400 users",
    sort_order: 11,
  },
];

export const DEV_MOCK_COMMUNITIES = [
  {
    id: 1,
    name: "Oak Valley Residences",
    address: "1200 Oak Valley Dr",
    region_id: 1,
    region: "Florida - Miami-Dade County",
  },
  {
    id: 2,
    name: "Maple Grove Apartments",
    address: "800 Maple Grove Blvd",
    region_id: 2,
    region: "Florida - Tampa Bay",
  },
  {
    id: 3,
    name: "Bay View Towers",
    address: "500 Market St",
    region_id: 5,
    region: "California - Bay Area",
  },
];

export function filterDevMockRegions(q) {
  const needle = String(q ?? "").trim().toLowerCase();
  if (!needle) return DEV_MOCK_REGIONS;

  return DEV_MOCK_REGIONS.filter(
    (region) =>
      region.title.toLowerCase().includes(needle) ||
      region.area.toLowerCase().includes(needle) ||
      region.state.toLowerCase().includes(needle),
  );
}

export function filterDevMockCommunities({ regionId, q } = {}) {
  let list = DEV_MOCK_COMMUNITIES;

  if (regionId != null) {
    list = list.filter((item) => Number(item.region_id) === Number(regionId));
  }

  const needle = String(q ?? "").trim().toLowerCase();
  if (!needle) return list;

  return list.filter(
    (item) =>
      item.name.toLowerCase().includes(needle) ||
      String(item.address ?? "").toLowerCase().includes(needle) ||
      String(item.region ?? "").toLowerCase().includes(needle),
  );
}
