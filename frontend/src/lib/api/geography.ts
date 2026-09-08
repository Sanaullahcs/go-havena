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
