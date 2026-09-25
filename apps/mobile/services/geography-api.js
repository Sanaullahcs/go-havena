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

export async function resolveLocation({ countryId, stateId, city }) {
  const resolvedStateId = Number(stateId);
  if (!Number.isFinite(resolvedStateId) || resolvedStateId <= 0) return null;
  const cityName = String(city ?? "").trim();
  const result = await apiRequest("/locations/resolve", {
    method: "POST",
    auth: false,
    community: false,
    body: {
      ...(Number(countryId) > 0 ? { country_id: Number(countryId) } : {}),
      state_id: resolvedStateId,
      ...(cityName ? { city: cityName } : {}),
    },
  });
  return result.data ?? null;
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
