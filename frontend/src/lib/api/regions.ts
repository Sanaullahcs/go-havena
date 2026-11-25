import api from "./client";

export interface Region {
  id: number;
  title: string;
  hierarchy_label?: string;
  is_city_level?: boolean;
  level?: "city" | "state";
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

export type RegionStats = {
  total: number;
  active: number;
  inactive: number;
};

export async function fetchRegions(params?: Record<string, unknown>) {
  const res = await api.get("/v1/admin/regions", { params });
  return res.data as {
    data: Region[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
      stats?: RegionStats;
    };
  };
}

/** Active city-level regions for assign / invite pickers (paginates through admin index). */
export async function fetchActiveCityRegionsForPicker(perPage = 100): Promise<Region[]> {
  const first = await fetchRegions({ status: "active", per_page: perPage, city_level: 1, page: 1 });
  const lastPage = first.meta.last_page ?? 1;
  const pages =
    lastPage <= 1
      ? [first.data]
      : await Promise.all(
          Array.from({ length: lastPage - 1 }, (_, index) =>
            fetchRegions({
              status: "active",
              per_page: perPage,
              city_level: 1,
              page: index + 2,
            }).then((res) => res.data),
          ),
        );
  return [...first.data, ...pages.flat()].filter((region) => region.status === "active");
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
