import api from "./client";

export interface Deal {
  id: number;
  community_id: number;
  title: string;
  vendor: string | null;
  description: string;
  type: "deal" | "offer" | "coupon";
  discount_label: string | null;
  original_price: number | null;
  discounted_price: number | null;
  promo_code: string | null;
  category: string | null;
  location: string | null;
  image_url: string | null;
  is_featured: boolean;
  status: string;
  is_expired: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealStats {
  total: number; active: number; inactive: number; expired: number; featured: number;
}

export interface DealMeta {
  current_page: number; last_page: number; total: number; per_page?: number;
  stats?: DealStats;
}

export interface DealFormData {
  title: string;
  description: string;
  vendor?: string | null;
  type?: "deal" | "offer" | "coupon";
  discount_label?: string | null;
  original_price?: number | null;
  discounted_price?: number | null;
  promo_code?: string | null;
  category?: string | null;
  location?: string | null;
  image_url?: string | null;
  is_featured?: boolean;
  status?: string;
  starts_at?: string | null;
  ends_at?: string | null;
}

export async function fetchDeals(params?: Record<string, unknown>) {
  const res = await api.get("/v1/deals", { params });
  return res.data as { data: Deal[]; meta: DealMeta };
}

export async function fetchAdminDeals(params?: Record<string, unknown>) {
  const res = await api.get("/v1/admin/deals", { params });
  return res.data as { data: Deal[]; meta: DealMeta };
}

export async function fetchDeal(id: number) {
  const res = await api.get(`/v1/deals/${id}`);
  return res.data.data as Deal;
}

export async function createDeal(data: DealFormData) {
  const res = await api.post("/v1/admin/deals", data);
  return res.data.data as Deal;
}

export async function updateDeal(id: number, data: Partial<DealFormData>) {
  const res = await api.patch(`/v1/admin/deals/${id}`, data);
  return res.data.data as Deal;
}

export async function deleteDeal(id: number) {
  return api.delete(`/v1/admin/deals/${id}`);
}

export async function uploadDealImage(file: File) {
  const fd = new FormData();
  fd.append("image", file);
  const res = await api.post("/v1/admin/deals/upload-image", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data.image_url as string;
}
