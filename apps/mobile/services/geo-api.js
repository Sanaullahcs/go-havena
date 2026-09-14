import { apiRequest } from "./api-client";

export async function suggestAddress(q) {
  const query = String(q ?? "").trim();
  if (query.length < 3) return [];

  const params = new URLSearchParams({ q: query });
  const res = await apiRequest(`/geo/address-suggest?${params}`);
  return Array.isArray(res?.data) ? res.data : [];
}

export async function reverseAddress(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
  });
  const res = await apiRequest(`/geo/address-reverse?${params}`);
  const row = res?.data;
  if (!row || typeof row.address !== "string" || row.address.trim() === "") {
    return null;
  }
  return row;
}
