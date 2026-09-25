import api from "./client";

/** Maximum photos per marketplace listing (dashboard + API). */
export const MAX_LISTING_PHOTOS = 6;

export interface Listing {
  id: number; type: string; category: string | null; condition: string | null; title: string; price: number | null;
  description: string; location: string | null; images: string[]; status: string;
  is_verified: boolean; is_saved: boolean; created_at: string;
  seller_name: string; seller_unit: string | null; seller_avatar: string | null;
}

export const LISTING_CONDITIONS = ["Like New", "Good", "Fair", "For Parts"] as const;

export interface ListingStats {
  total: number; pending: number; active: number; rejected: number; sold: number;
}

export interface ListingMeta {
  current_page: number; last_page: number; total: number; per_page?: number;
  stats?: ListingStats;
}

export interface ListingFormData {
  type: string;
  title: string;
  price: number;
  description: string;
  category: string;
  condition?: string | null;
  location?: string | null;
  images?: string[];
}

export async function fetchListings(params?: Record<string, unknown>) {
  const res = await api.get("/v1/listings", { params });
  return res.data as { data: Listing[]; meta: ListingMeta };
}

export async function createListing(data: ListingFormData) {
  const res = await api.post("/v1/listings", data);
  return res.data as { data: { id: number; status: string }; message: string };
}

export async function updateListing(id: number, data: Partial<ListingFormData>) {
  const res = await api.post(`/v1/listings/${id}`, data);
  return res.data;
}

export async function toggleSaveListing(id: number) {
  const res = await api.post(`/v1/listings/${id}/save`);
  return res.data as { saved: boolean };
}

export async function approveListing(id: number) {
  return api.post(`/v1/admin/listings/${id}/approve`);
}

export async function rejectListing(id: number) {
  return api.post(`/v1/admin/listings/${id}/reject`);
}

export async function deleteListing(id: number) {
  return api.delete(`/v1/listings/${id}`);
}

export async function uploadListingImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  const res = await api.post("/v1/listings/upload-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data.image_url as string;
}
