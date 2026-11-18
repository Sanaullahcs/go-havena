import api from "./client";

export interface Country {
  id: number;
  code: string;
  name: string;
  billing_policy: "required" | "exempt";
  billing_exempt: boolean;
  sort_order: number;
  status: "active" | "inactive";
  states_count?: number;
}

export interface State {
  id: number;
  country_id: number;
  name: string;
  code: string | null;
  sort_order: number;
  status: "active" | "inactive";
  country?: Country;
}

export async function fetchPublicCountries() {
  const res = await api.get("/v1/countries");
  return res.data as { data: Country[] };
}

export async function fetchPublicCountryStates(countryId: number) {
  const res = await api.get(`/v1/countries/${countryId}/states`);
  return res.data as { data: State[] };
}

export interface City {
  id: number;
  state_id: number;
  name: string;
}

export async function fetchPublicStateCities(stateId: number, q?: string) {
  const res = await api.get(`/v1/states/${stateId}/cities`, {
    params: q ? { q } : undefined,
  });
  return res.data as { data: City[] };
}

export type PublicCityRegion = {
  type?: "region";
  id: number;
  title: string;
  hierarchy_label?: string;
  area: string;
  state_id: number | null;
  state_name: string | null;
  country_id: number | null;
  country_name: string | null;
  status: string;
};

/** Search an existing city region — does not create new regions. */
export async function searchPublicCityRegion(payload: {
  country_id?: number;
  state_id: number;
  city: string;
}) {
  const res = await api.get("/v1/regions", {
    params: {
      state_id: payload.state_id,
      city: payload.city,
      ...(payload.country_id ? { country_id: payload.country_id } : {}),
    },
  });
  const match = (res.data.data as PublicCityRegion[]).find((row) => row.type === "region" || !("type" in row));
  if (!match) {
    const err = new Error("No service region exists for this city yet.");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }
  return { data: match };
}

/** @deprecated Use searchPublicCityRegion — kept for older callers; find-only via POST. */
export async function resolvePublicLocation(payload: {
  country_id?: number;
  state_id: number;
  city?: string;
}) {
  if (!payload.city?.trim()) {
    throw new Error("City is required.");
  }
  try {
    return await searchPublicCityRegion({
      country_id: payload.country_id,
      state_id: payload.state_id,
      city: payload.city,
    });
  } catch {
    const res = await api.post("/v1/locations/resolve", {
      country_id: payload.country_id,
      state_id: payload.state_id,
      city: payload.city,
    });
    return res.data as { data: PublicCityRegion };
  }
}

export async function fetchCountries(params?: { q?: string }) {
  const res = await api.get("/v1/admin/countries", { params });
  return res.data as { data: Country[] };
}

export async function fetchStates(params?: { country_id?: number; status?: string }) {
  const res = await api.get("/v1/admin/states", { params });
  return res.data as { data: State[] };
}

export async function createState(data: {
  country_id: number;
  name: string;
  code?: string;
  sort_order?: number;
  status?: State["status"];
}) {
  const res = await api.post("/v1/admin/states", data);
  return res.data as { data: State; message: string };
}
