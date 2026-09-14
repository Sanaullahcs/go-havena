import api from "./client";

export type AddressSuggestion = {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
};

export async function suggestAddress(q: string) {
  const res = await api.get("/v1/geo/address-suggest", { params: { q } });
  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  return rows as AddressSuggestion[];
}

export async function reverseAddress(latitude: number, longitude: number) {
  const res = await api.get("/v1/geo/address-reverse", {
    params: { lat: latitude, lng: longitude },
  });
  const row = res.data?.data;
  if (!row || typeof row.address !== "string" || row.address.trim() === "") {
    return null;
  }
  return row as { address: string; latitude: number; longitude: number };
}
