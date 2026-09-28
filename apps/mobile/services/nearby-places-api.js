import { apiRequest } from "./api-client";
import { getCommunityId } from "./auth-session";

export const NEARBY_PLACE_CATEGORIES = [
  "restaurants",
  "cafes",
  "pharmacies",
  "banks",
  "gyms",
  "supermarkets",
];

export const NEARBY_FILTER_CATEGORIES = ["all", ...NEARBY_PLACE_CATEGORIES];

function nearbyPlaceHasPhone(place) {
  return Boolean(String(place?.phone ?? "").trim());
}

export function compareNearbyPlacesByPhoneThenDistance(a, b) {
  const phoneCmp = Number(nearbyPlaceHasPhone(b)) - Number(nearbyPlaceHasPhone(a));
  if (phoneCmp !== 0) return phoneCmp;
  return (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0);
}

export function mergeNearbyPlaces(byCategory = {}) {
  const seen = new Map();
  for (const category of NEARBY_PLACE_CATEGORIES) {
    for (const place of byCategory[category] ?? []) {
      if (!place?.id || seen.has(place.id)) continue;
      seen.set(place.id, place);
    }
  }
  return [...seen.values()].sort(compareNearbyPlacesByPhoneThenDistance);
}

let bundleCache = null;
let bundleCommunityId = null;
const bundleInFlightByCommunity = new Map();

function emptyGroups() {
  return Object.fromEntries(NEARBY_PLACE_CATEGORIES.map((key) => [key, []]));
}

export function mapNearbyPlace(row, fallbackCategory = "") {
  if (!row) return null;
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    category: String(row.category ?? fallbackCategory ?? ""),
    address: row.address ? String(row.address) : null,
    phone: row.phone ? String(row.phone) : null,
    hours: row.hours ? String(row.hours) : null,
    website: row.website ? String(row.website) : null,
    cuisine: row.cuisine ? String(row.cuisine) : null,
    brand: row.brand ? String(row.brand) : null,
    operator: row.operator ? String(row.operator) : null,
    email: row.email ? String(row.email) : null,
    wheelchair: row.wheelchair ? String(row.wheelchair) : null,
    outdoorSeating: row.outdoor_seating ? String(row.outdoor_seating) : null,
    takeaway: row.takeaway ? String(row.takeaway) : null,
    delivery: row.delivery ? String(row.delivery) : null,
    description: row.description ? String(row.description) : null,
    facebook: row.facebook ? String(row.facebook) : null,
    instagram: row.instagram ? String(row.instagram) : null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    distanceMeters: Number(row.distance_meters ?? 0),
    distanceKm: Number(row.distance_km ?? 0),
  };
}

function mapGroup(rows, category) {
  return (Array.isArray(rows) ? rows : []).map((row) => mapNearbyPlace(row, category)).filter(Boolean);
}

export function clearNearbyPlacesCache() {
  bundleCache = null;
  bundleCommunityId = null;
  bundleInFlightByCommunity.clear();
}

export async function fetchNearbyPlacesBundle({ force = false, communityId: requestedId } = {}) {
  const communityId = requestedId != null && String(requestedId).trim() !== ""
    ? String(requestedId)
    : await getCommunityId();
  const cacheKey = String(communityId ?? "");
  if (!force && bundleCache && bundleCommunityId === cacheKey) return bundleCache;
  if (!force && bundleInFlightByCommunity.has(cacheKey)) {
    return bundleInFlightByCommunity.get(cacheKey);
  }

  const request = (async () => {
    const params = new URLSearchParams({ all: "1" });
    if (communityId) params.set("community_id", String(communityId));
    const res = await apiRequest(`/nearby-places?${params}`, {
      cache: "no-store",
      timeoutMs: 40000,
      community: false,
    });
    const grouped = res?.meta?.grouped && res?.data && !Array.isArray(res.data);
    const byCategory = emptyGroups();

    if (grouped) {
      for (const category of NEARBY_PLACE_CATEGORIES) {
        byCategory[category] = mapGroup(res.data?.[category], category);
      }
    } else {
      const fallbackCategory = res?.meta?.category ?? "restaurants";
      byCategory[fallbackCategory] = mapGroup(res?.data, fallbackCategory);
    }

    const payload = {
      byCategory,
      hasCoordinates: Boolean(res?.meta?.has_coordinates),
      overpassFailed: Boolean(res?.meta?.overpass_failed),
      radiusMeters: Number(res?.meta?.radius_meters ?? 3000),
      communityId: res?.meta?.community_id ?? communityId ?? null,
      latitude: res?.meta?.latitude ?? null,
      longitude: res?.meta?.longitude ?? null,
    };
    const hasPlaces = NEARBY_PLACE_CATEGORIES.some((key) => (byCategory[key] ?? []).length > 0);
    if (hasPlaces && !payload.overpassFailed) {
      bundleCache = payload;
      bundleCommunityId = cacheKey;
    }
    return payload;
  })();

  bundleInFlightByCommunity.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (bundleInFlightByCommunity.get(cacheKey) === request) {
      bundleInFlightByCommunity.delete(cacheKey);
    }
  }
}

export async function fetchNearbyPlaces(category = "all") {
  const bundle = await fetchNearbyPlacesBundle();
  const key = NEARBY_FILTER_CATEGORIES.includes(category) ? category : "all";
  return {
    places: key === "all" ? mergeNearbyPlaces(bundle.byCategory) : (bundle.byCategory[key] ?? []),
    hasCoordinates: bundle.hasCoordinates,
    radiusMeters: bundle.radiusMeters,
    category: key,
  };
}
