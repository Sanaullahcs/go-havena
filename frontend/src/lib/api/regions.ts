import api from "./client";

export interface Region {
  id: number;
  title: string;
  area: string;
  state: string | null;
  state_id: number | null;
  state_name?: string | null;
  country_id?: number | null;
  country_code?: string | null;
  country_name?: string | null;
  billing_exempt?: boolean;
  users_label: string;
  sort_order: number;
  status: "active" | "inactive";
  created_at?: string;
  updated_at?: string;
}

export async function fetchRegions(params?: Record<string, unknown>) {
  const res = await api.get("/v1/admin/regions", { params });
  return res.data as {
    data: Region[];
    meta: { current_page: number; last_page: number; total: number; per_page: number };
  };
}

export async function createRegion(data: Partial<Region>) {
  const res = await api.post("/v1/admin/regions", data);
  return res.data;
}

export async function updateRegion(id: number, data: Partial<Region>) {
  const res = await api.put(`/v1/admin/regions/${id}`, data);
  return res.data;
}

export async function deleteRegion(id: number) {
  return api.delete(`/v1/admin/regions/${id}`);
}
