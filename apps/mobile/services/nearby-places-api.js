import { apiRequest } from "./api-client";
import { getCommunityId } from "./auth-session";

export const NEARBY_PLACE_CATEGORIES = [
  "restaurants",
  "cafes",
  "pharmacies",
  "hospitals",
  "gyms",
  "gas_stations",
  "parking",
  "clubs",
  "shopping",
];

export const NEARBY_FILTER_CATEGORIES = ["all", ...NEARBY_PLACE_CATEGORIES];

export const ESSENTIAL_SECTION_CATEGORIES = {
  health: ["hospitals", "pharmacies"],
  burial: ["burial_places"],
  parking: ["parking"],
  clubs: ["clubs"],
};

const BUNDLE_CATEGORIES = [...NEARBY_PLACE_CATEGORIES, "burial_places"];

export const DISCOVER_RADIUS_OPTIONS = Array.from({ length: 20 }, (_, index) => (index + 1) * 500);
export const DEFAULT_DISCOVER_RADIUS_METERS = 3000;

export function formatDiscoverRadius(meters) {
  const km = Number(meters) / 1000;
  if (!Number.isFinite(km) || km <= 0) return "";
  const text = Number.isInteger(km) ? String(km) : km.toFixed(1);
  return `${text} km`;
}

export function normalizeDiscoverRadius(meters) {
  const value = Number(meters);
  return DISCOVER_RADIUS_OPTIONS.includes(value) ? value : DEFAULT_DISCOVER_RADIUS_METERS;
}

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

const bundleCacheByKey = new Map();
const bundleInFlightByCommunity = new Map();

function emptyGroups() {
  return Object.fromEntries(BUNDLE_CATEGORIES.map((key) => [key, []]));
}

export function placesForEssentialSection(byCategory = {}, section = "") {
  const seen = new Set();
  const rows = [];
  for (const category of ESSENTIAL_SECTION_CATEGORIES[section] ?? []) {
    for (const place of byCategory[category] ?? []) {
      if (!place?.id || seen.has(place.id) || place.category === "gyms") continue;
      seen.add(place.id);
      rows.push(place);
    }
  }
  return rows.sort(compareNearbyPlacesByPhoneThenDistance);
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
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
    verified: Boolean(row.verified),
    source: row.source ? String(row.source) : "osm",
  };
}

function mapGroup(rows, category) {
  return (Array.isArray(rows) ? rows : []).map((row) => mapNearbyPlace(row, category)).filter(Boolean);
}

export function clearNearbyPlacesCache() {
  bundleCacheByKey.clear();
  bundleInFlightByCommunity.clear();
}

function mergeBundleMeta(meta, previous) {
  const hasCoordinates = Boolean(meta?.has_coordinates)
    || Boolean(previous?.hasCoordinates)
    || (Number.isFinite(Number(meta?.latitude)) && Number.isFinite(Number(meta?.longitude)))
    || (Number.isFinite(Number(previous?.latitude)) && Number.isFinite(Number(previous?.longitude)));

  return {
    hasCoordinates,
    overpassFailed: Boolean(meta?.overpass_failed) || Boolean(previous?.overpassFailed),
    communityId: meta?.community_id ?? previous?.communityId ?? null,
    latitude: meta?.latitude ?? previous?.latitude ?? null,
    longitude: meta?.longitude ?? previous?.longitude ?? null,
  };
}

function snapshotBundle(byCategory, meta, radiusMeters, complete, previous = null) {
  const merged = mergeBundleMeta(meta, previous);
  return {
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([key, rows]) => [key, rows.slice()])),
    hasCoordinates: merged.hasCoordinates,
    overpassFailed: merged.overpassFailed,
    radiusMeters,
    communityId: merged.communityId,
    latitude: merged.latitude,
    longitude: merged.longitude,
    complete,
  };
}

function coveringBundle(communityId, radiusMeters) {
  const prefix = `${communityId ?? ""}:`;
  let best = null;
  let bestRadius = Infinity;
  for (const [key, bundle] of bundleCacheByKey) {
    if (!bundle?.complete || !key.startsWith(prefix)) continue;
    const cachedRadius = Number(key.slice(prefix.length));
    if (cachedRadius >= radiusMeters && cachedRadius < bestRadius) {
      best = bundle;
      bestRadius = cachedRadius;
    }
  }
  return best;
}

function placeInsideRadius(place, radiusMeters) {
  const meters = Number(place?.distanceMeters ?? 0);
  return !Number.isFinite(meters) || meters <= 0 || meters <= radiusMeters;
}

function mergePlaceList(byCategory, category, places) {
  const incoming = (places ?? []).filter((place) => place?.id);
  if (incoming.length === 0) return;
  const seen = new Set((byCategory[category] ?? []).map((place) => place.id));
  byCategory[category] = [
    ...(byCategory[category] ?? []),
    ...incoming.filter((place) => !seen.has(place.id)),
  ];
}

function absorbBundle(byCategory, bundle, radiusMeters) {
  if (!bundle?.byCategory) return;
  for (const category of BUNDLE_CATEGORIES) {
    mergePlaceList(
      byCategory,
      category,
      (bundle.byCategory[category] ?? []).filter((place) => placeInsideRadius(place, radiusMeters)),
    );
  }
}

function mergeBundlePage(byCategory, data) {
  for (const category of BUNDLE_CATEGORIES) {
    mergePlaceList(byCategory, category, mapGroup(data?.[category], category));
  }
}

export async function fetchNearbyPlacesBundle({ force = false, communityId: requestedId, radiusMeters: requestedRadius, seedBundle = null, onPage } = {}) {
  const communityId = requestedId != null && String(requestedId).trim() !== ""
    ? String(requestedId)
    : await getCommunityId();
  const radiusMeters = normalizeDiscoverRadius(requestedRadius);
  const cacheKey = `${communityId ?? ""}:${radiusMeters}`;
  const prefix = `${communityId ?? ""}:`;
  if (!force) {
    const covered = coveringBundle(communityId, radiusMeters);
    if (covered) {
      const byCategory = emptyGroups();
      absorbBundle(byCategory, covered, radiusMeters);
      absorbBundle(byCategory, seedBundle, radiusMeters);
      const filtered = snapshotBundle(byCategory, {
        has_coordinates: covered.hasCoordinates || seedBundle?.hasCoordinates,
        community_id: covered.communityId ?? seedBundle?.communityId,
        latitude: covered.latitude ?? seedBundle?.latitude,
        longitude: covered.longitude ?? seedBundle?.longitude,
      }, radiusMeters, true);
      bundleCacheByKey.set(cacheKey, filtered);
      onPage?.(filtered, { done: true });
      return filtered;
    }
    if (bundleCacheByKey.has(cacheKey)) {
      const cached = bundleCacheByKey.get(cacheKey);
      onPage?.(cached, { done: true });
      return cached;
    }
    if (bundleInFlightByCommunity.has(cacheKey)) {
      return bundleInFlightByCommunity.get(cacheKey);
    }
  }

  const request = (async () => {
    const byCategory = emptyGroups();
    for (const [key, bundle] of bundleCacheByKey) {
      if (!bundle?.complete || !key.startsWith(prefix)) continue;
      const cachedRadius = Number(key.slice(prefix.length));
      if (cachedRadius > 0 && cachedRadius <= radiusMeters) absorbBundle(byCategory, bundle, radiusMeters);
    }
    absorbBundle(byCategory, seedBundle, radiusMeters);
    const hasSeed = BUNDLE_CATEGORIES.some((key) => (byCategory[key] ?? []).length > 0);
    if (hasSeed) {
      onPage?.(snapshotBundle(byCategory, {
        has_coordinates: seedBundle?.hasCoordinates,
        community_id: seedBundle?.communityId,
        latitude: seedBundle?.latitude,
        longitude: seedBundle?.longitude,
      }, radiusMeters, false, seedBundle), { done: false });
    }
    let page = 1;
    let payload = snapshotBundle(byCategory, {}, radiusMeters, false, seedBundle);
    let failedPage = false;
    const loadPage = async (pageNumber) => {
      const params = new URLSearchParams({
        all: "1",
        radius_meters: String(radiusMeters),
        page: String(pageNumber),
      });
      if (communityId) params.set("community_id", String(communityId));
      return apiRequest(`/nearby-places?${params}`, {
        cache: "no-store",
        timeoutMs: 25000,
        community: false,
      });
    };
    for (let guard = 0; guard < 20 && page <= 20; guard += 1) {
      let res = null;
      try {
        res = await loadPage(page);
      } catch {
        try {
          res = await loadPage(page);
        } catch {
          failedPage = true;
          page += 1;
          continue;
        }
      }
      const grouped = res?.meta?.grouped && res?.data && !Array.isArray(res.data);
      if (grouped) mergeBundlePage(byCategory, res.data);
      const pageCount = Number(res?.meta?.page_count || 0);
      const done = !res?.meta?.has_more && !failedPage;
      payload = snapshotBundle(byCategory, res?.meta, radiusMeters, done, payload);
      onPage?.(payload, { done });
      if (!res?.meta?.has_coordinates || !res?.meta?.has_more) break;
      page = Number(res?.meta?.next_page || page + 1);
      if (pageCount > 0 && page > pageCount) break;
    }
    payload = { ...payload, complete: !failedPage };
    if (!failedPage) bundleCacheByKey.set(cacheKey, payload);
    onPage?.(payload, { done: !failedPage });
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
