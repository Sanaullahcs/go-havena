import { apiRequest } from "./api-client";
import { normalizeDiscoverRadius } from "./nearby-places-api";

export async function fetchEssentials({ radiusMeters, includePlaces = false } = {}) {
  const radius = normalizeDiscoverRadius(radiusMeters);
  const params = new URLSearchParams({
    radius_meters: String(radius),
    include_places: includePlaces ? "1" : "0",
  });
  const res = await apiRequest(`/essentials?${params}`, { cache: "no-store", timeoutMs: 20000 });
  const sections = Array.isArray(res?.data?.sections) ? res.data.sections : [];
  return {
    sections: sections.map((section) => ({
      key: String(section.key ?? ""),
      label: section.label ? String(section.label) : "",
      entries: Array.isArray(section.entries) ? section.entries : [],
      places: [],
    })),
    suggestions: Array.isArray(res?.data?.suggestions) ? res.data.suggestions : [],
    categories: Array.isArray(res?.data?.categories) ? res.data.categories : [],
    latitude: res?.meta?.latitude ?? null,
    longitude: res?.meta?.longitude ?? null,
    hasCoordinates: Boolean(res?.meta?.has_coordinates),
  };
}

export async function fetchMyPlaceSuggestions() {
  const res = await apiRequest("/nearby-places/suggestions", { cache: "no-store" });
  return Array.isArray(res?.data) ? res.data : [];
}

export async function submitPlaceSuggestion(body) {
  const res = await apiRequest("/nearby-places/suggestions", { method: "POST", body });
  return res?.data ?? null;
}

export async function fetchAdminEssentials() {
  const res = await apiRequest("/admin/essentials", { cache: "no-store" });
  return {
    entries: Array.isArray(res?.data?.entries) ? res.data.entries : [],
    suggestions: Array.isArray(res?.data?.suggestions) ? res.data.suggestions : [],
    categories: Array.isArray(res?.data?.categories) ? res.data.categories : [],
  };
}

export async function createEssentialEntry(body) {
  return apiRequest("/admin/essentials", { method: "POST", body });
}

export async function updateEssentialEntry(id, body) {
  return apiRequest(`/admin/essentials/${id}`, { method: "PATCH", body });
}

export async function deleteEssentialEntry(id) {
  return apiRequest(`/admin/essentials/${id}`, { method: "DELETE" });
}

export async function reviewPlaceSuggestion(id, decision) {
  return apiRequest(`/admin/nearby-suggestions/${id}/${decision}`, { method: "POST", body: {} });
}
