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
