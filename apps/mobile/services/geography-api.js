import { apiRequest } from "./api-client";

export async function fetchCountries() {
  const result = await apiRequest("/countries", {
    auth: false,
    community: false,
  });
  return Array.isArray(result.data) ? result.data : [];
}

export async function fetchCountryStates(countryId) {
  if (!countryId) return [];
  const result = await apiRequest(`/countries/${countryId}/states`, {
    auth: false,
    community: false,
  });
  return Array.isArray(result.data) ? result.data : [];
}

export async function resolveLocation({ countryId, stateId, city }) {
  if (!stateId) return null;
  const result = await apiRequest("/locations/resolve", {
    method: "POST",
    auth: false,
    community: false,
    body: {
      ...(countryId ? { country_id: countryId } : {}),
      state_id: stateId,
      ...(city ? { city } : {}),
    },
  });
  return result.data ?? null;
}

export async function fetchStateCities(stateId, query) {
  if (!stateId) return [];
  const params = new URLSearchParams();
  if (query?.trim()) params.set("q", query.trim());
  const qs = params.toString();
  const result = await apiRequest(`/states/${stateId}/cities${qs ? `?${qs}` : ""}`, {
    auth: false,
    community: false,
  });
  return Array.isArray(result.data) ? result.data : [];
}
