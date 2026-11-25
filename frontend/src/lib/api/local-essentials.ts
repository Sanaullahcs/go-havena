import api from "./client";

export type EssentialSection = "health" | "burial" | "parking" | "clubs" | "food";

export const ESSENTIAL_SECTIONS: Array<{ value: EssentialSection; label: string }> = [
  { value: "health", label: "Health & urgent care" },
  { value: "burial", label: "Burial & funeral" },
  { value: "parking", label: "Parking & access" },
  { value: "clubs", label: "Clubs & activities" },
  { value: "food", label: "Food" },
];

export const NEARBY_CATEGORIES = [
  { value: "restaurants", label: "Restaurants" },
  { value: "cafes", label: "Cafes" },
  { value: "pharmacies", label: "Pharmacies" },
  { value: "hospitals", label: "Hospitals" },
  { value: "gyms", label: "Gyms" },
  { value: "gas_stations", label: "Gas stations" },
  { value: "parking", label: "Parking" },
  { value: "clubs", label: "Clubs" },
  { value: "shopping", label: "Shopping" },
];

export type EssentialEntry = {
  id: number;
  section: EssentialSection | string;
  title: string;
  body?: string | null;
  description?: string | null;
  phone?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nearby_category?: string | null;
  verified: boolean;
};

export type EssentialSuggestion = {
  id: number;
  kind: string;
  name?: string | null;
  category?: string | null;
  address?: string | null;
  phone?: string | null;
  note?: string | null;
  description?: string | null;
  essential_section?: string | null;
  publish_nearby?: boolean;
  publish_essentials?: boolean;
  status: string;
};

export type ListingCategory = { value: string; label: string };

export async function fetchAdminLocalEssentials(): Promise<{
  entries: EssentialEntry[];
  suggestions: EssentialSuggestion[];
  categories: ListingCategory[];
}> {
  const res = await api.get("/v1/admin/essentials");
  return {
    entries: Array.isArray(res.data?.data?.entries) ? res.data.data.entries : [],
    suggestions: Array.isArray(res.data?.data?.suggestions) ? res.data.data.suggestions : [],
    categories: Array.isArray(res.data?.data?.categories) ? res.data.data.categories : [],
  };
}

export async function createLocalEssential(body: {
  section: string;
  title: string;
  body?: string | null;
  description?: string | null;
  phone?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nearby_category?: string | null;
  verified?: boolean;
}): Promise<void> {
  await api.post("/v1/admin/essentials", { verified: true, ...body });
}

export async function deleteLocalEssential(id: number): Promise<void> {
  await api.delete(`/v1/admin/essentials/${id}`);
}

export async function reviewLocalEssentialSuggestion(id: number, decision: "approve" | "reject"): Promise<void> {
  await api.post(`/v1/admin/nearby-suggestions/${id}/${decision}`);
}
