import { apiRequest } from "./api-client";

export async function suggestAddress(q) {
  const query = String(q ?? "").trim();
  if (query.length < 3) return [];

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "6");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "en");
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (response.ok) {
      const rows = await response.json();
      if (Array.isArray(rows) && rows.length > 0) {
        return rows
          .map((row) => {
            const latitude = Number(row?.lat);
            const longitude = Number(row?.lon);
            const address = String(row?.display_name ?? "").trim();
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !address) return null;
            const name = String(row?.name ?? "").trim();
            return {
              label: name && !address.startsWith(name) ? `${name}, ${address}` : address,
              address,
              latitude,
              longitude,
            };
          })
          .filter(Boolean);
      }
    }
  } catch {
    // Fall through to the API.
  }

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
