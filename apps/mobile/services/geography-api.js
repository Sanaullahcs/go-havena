import { apiRequest } from "./api-client";

function asPlaces(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && item.id != null && item.name)
    .map((item) => ({
      id: item.id,
      name: String(item.name).trim(),
      code: item.code ? String(item.code) : "",
      state_id: item.state_id ?? null,
    }));
}

let countriesCache = null;
let countriesRequest = null;

export function getCachedCountries() {
  return countriesCache ?? [];
}

/** Start /countries as soon as Find your area mounts, not when the dropdown opens. */
export function prefetchCountries() {
  if (countriesCache) return Promise.resolve(countriesCache);
  if (!countriesRequest) {
    countriesRequest = apiRequest("/countries", {
      auth: false,
      community: false,
    })
      .then((result) => {
        countriesCache = asPlaces(result.data);
        return countriesCache;
      })
      .catch((err) => {
        countriesRequest = null;
        throw err;
      });
  }
  return countriesRequest;
}

export async function fetchCountries() {
  return prefetchCountries();
}

export async function fetchCountryStates(countryId) {
  const id = Number(countryId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const result = await apiRequest(`/countries/${id}/states`, {
    auth: false,
    community: false,
  });
  return asPlaces(result.data);
}

/** Find an existing city region for filters — does not create regions. */
export async function findCityRegion({ countryId, stateId, city }) {
  const resolvedStateId = Number(stateId);
  const cityName = String(city ?? "").trim();
  if (!Number.isFinite(resolvedStateId) || resolvedStateId <= 0 || !cityName) return null;

  const params = new URLSearchParams();
  params.set("state_id", String(resolvedStateId));
  params.set("city", cityName);
  if (Number(countryId) > 0) params.set("country_id", String(countryId));

  const result = await apiRequest(`/regions?${params.toString()}`, {
    auth: false,
    community: false,
  });
  const list = Array.isArray(result.data) ? result.data : [];
  return list.find((item) => item?.type === "region") ?? null;
}

/** @deprecated Use findCityRegion — retained as alias for older screens. */
export async function resolveLocation(args) {
  return findCityRegion(args);
}

export async function fetchStateCities(stateId, query) {
  const id = Number(stateId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const params = new URLSearchParams();
  if (query?.trim()) params.set("q", query.trim());
  const qs = params.toString();
  const result = await apiRequest(`/states/${id}/cities${qs ? `?${qs}` : ""}`, {
    auth: false,
    community: false,
    timeoutMs: 45000,
  });
  return asPlaces(result.data);
}
