import api from "./client";

export type AddressSuggestion = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
};

const GEO_TIMEOUT_MS = 45_000;
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

type NominatimHit = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
};

function formatNominatimAddress(row: NominatimHit): string {
  const addr = row.address ?? {};
  const street = [addr.house_number, addr.road || addr.pedestrian || addr.residential]
    .filter((part) => Boolean(part && String(part).trim()))
    .join(" ")
    .trim();
  const parts = [
    street,
    addr.suburb || addr.neighbourhood || addr.quarter || addr.hamlet,
    addr.city || addr.town || addr.village || addr.municipality,
    addr.state || addr.region,
    addr.postcode,
    addr.country,
  ];
  const unique: string[] = [];
  for (const part of parts) {
    const text = String(part ?? "").trim();
    if (text && !unique.includes(text)) unique.push(text);
  }
  if (unique.length > 0) return unique.join(", ");
  return String(row.display_name ?? "").trim();
}

function mapNominatimHit(row: NominatimHit): AddressSuggestion | null {
  const latitude = Number(row.lat);
  const longitude = Number(row.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const address = formatNominatimAddress(row);
  const name = String(row.name ?? "").trim();
  const label = name && address && !address.startsWith(name) ? `${name}, ${address}` : address || name;
  if (!label) return null;

  return {
    label,
    address: address || label,
    latitude: Math.round(latitude * 1e7) / 1e7,
    longitude: Math.round(longitude * 1e7) / 1e7,
  };
}

/** Browser lookup. The PHP server's cURL calls to Photon/Nominatim time out on this machine. */
async function searchNominatim(q: string, limit: number, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const url = new URL(NOMINATIM_SEARCH);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row && typeof row === "object" ? mapNominatimHit(row as NominatimHit) : null))
    .filter((row): row is AddressSuggestion => row != null);
}

export async function suggestAddress(q: string, signal?: AbortSignal) {
  try {
    return await searchNominatim(q, 6, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
  }

  const res = await api.get("/v1/geo/address-suggest", { params: { q }, timeout: GEO_TIMEOUT_MS, signal });
  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  return rows as AddressSuggestion[];
}

export async function geocodeAddress(q: string) {
  try {
    const [first] = await searchNominatim(q, 1);
    if (first) return first;
  } catch {
    // Fall through to the API.
  }

  const res = await api.get("/v1/geo/address-geocode", { params: { q }, timeout: GEO_TIMEOUT_MS });
  const row = res.data?.data;
  if (
    !row
    || typeof row.latitude !== "number"
    || typeof row.longitude !== "number"
    || typeof row.address !== "string"
  ) {
    return null;
  }
  return row as { address: string; latitude: number; longitude: number };
}

export async function reverseAddress(latitude: number, longitude: number) {
  const res = await api.get("/v1/geo/address-reverse", {
    params: { lat: latitude, lng: longitude },
    timeout: GEO_TIMEOUT_MS,
  });
  const row = res.data?.data;
  if (!row || typeof row.address !== "string" || row.address.trim() === "") {
    return null;
  }
  return row as { address: string; latitude: number; longitude: number };
}
