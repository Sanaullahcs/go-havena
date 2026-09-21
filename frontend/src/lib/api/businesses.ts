import api from "./client";

export interface Business {
  id: number;
  community_id: number;
  owner_id: number;
  owner_name: string | null;
  name: string;
  category: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  hours: string | null;
  amenities: string | null;
  image_url: string | null;
  status: "pending" | "approved" | "rejected" | "inactive";
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessStats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  inactive: number;
}

export interface BusinessMeta {
  current_page: number;
  last_page: number;
  total: number;
  per_page?: number;
  stats?: BusinessStats;
}

export interface BusinessFormData {
  name: string;
  category: string;
  description: string;
  address: string;
  phone: string;
  hours: string;
  amenities?: string | null;
  image_url?: string | null;
  status?: string;
}

export async function fetchBusinesses(params?: Record<string, unknown>) {
  const res = await api.get("/v1/businesses", { params: { scope: "manage", ...params } });
  return res.data as { data: Business[]; meta: BusinessMeta };
}

export async function fetchBusiness(id: number) {
  const res = await api.get(`/v1/businesses/${id}`);
  return res.data.data as Business;
}

export async function createBusiness(data: BusinessFormData) {
  const res = await api.post("/v1/businesses", data);
  return res.data.data as Business;
}

export async function updateBusiness(id: number, data: Partial<BusinessFormData>) {
  const res = await api.patch(`/v1/businesses/${id}`, data);
  return res.data.data as Business;
}

export async function deleteBusiness(id: number) {
  return api.delete(`/v1/businesses/${id}`);
}

export async function approveBusiness(id: number) {
  const res = await api.patch(`/v1/admin/businesses/${id}/approve`);
  return res.data as { data: Business; meta?: { deals_reactivated?: number }; message?: string };
}

export async function reapproveBusiness(id: number) {
  const res = await api.patch(`/v1/admin/businesses/${id}/reapprove`);
  return res.data as { data: Business; meta?: { deals_reactivated?: number }; message?: string };
}

export async function rejectBusiness(id: number) {
  const res = await api.patch(`/v1/admin/businesses/${id}/reject`);
  return res.data as { data: Business; meta?: { deals_disabled?: number }; message?: string };
}

export async function uploadBusinessImage(file: File) {
  const fd = new FormData();
  fd.append("image", file);
  const res = await api.post("/v1/businesses/upload-image", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data.image_url as string;
}

export function businessStatusLabel(status: string) {
  if (status === "approved") return "Active";
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  if (status === "inactive") return "Inactive";
  return status;
}
