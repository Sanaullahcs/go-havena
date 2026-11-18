import api from "@/lib/api/client";

export type StaffMember = {
  id: number;
  user_id: number;
  name: string;
  email: string;
  phone: string | null;
  staff_type: "internal" | "external";
  status: "active" | "inactive";
  availability: "available" | "unavailable";
  specializations: string[];
  specialization_label: string;
  invitation: "accepted" | "pending" | "expired" | "inactive";
  delivery_error?: string | null;
  activated_at: string | null;
  open_complaints: number;
  complaints?: Array<{
    id: number;
    reference: string;
    title: string;
    category: string;
    status: string;
    updated_at: string;
  }>;
};

/** Same cadence as the community admin complaint list. */
export const STAFF_SYNC_MS = 4_000;

export const STAFF_SKILLS = [
  ["plumbing", "Plumbing"],
  ["electrical", "Electrical"],
  ["cleaning", "Cleaning"],
  ["lift_maintenance", "Lift Maintenance"],
  ["parking_maintenance", "Parking Maintenance"],
  ["general_maintenance", "General Maintenance"],
  ["other", "Other"],
] as const;

export async function fetchStaff(params?: {
  search?: string;
  specialization?: string;
  status?: string;
  availability?: string;
}): Promise<StaffMember[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.specialization && params.specialization !== "all") query.set("specialization", params.specialization);
  if (params?.status && params.status !== "all") query.set("status", params.status);
  if (params?.availability && params.availability !== "all") query.set("availability", params.availability);
  const res = await api.get(`/v1/admin/staff?${query.toString()}`);
  return res.data.data as StaffMember[];
}

export async function fetchStaffMember(id: number): Promise<StaffMember> {
  const res = await api.get(`/v1/admin/staff/${id}`);
  return res.data.data as StaffMember;
}

export type StaffResidentOption = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  unit: string;
};

export async function fetchStaffResidents(search = ""): Promise<StaffResidentOption[]> {
  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  const res = await api.get(`/v1/admin/staff/residents?${query.toString()}`);
  return res.data.data as StaffResidentOption[];
}

export async function createStaff(payload: {
  name: string;
  email: string;
  phone?: string;
  user_id?: number;
  staff_type: "internal" | "external";
  specializations: string[];
}): Promise<{ member: StaffMember; message: string }> {
  const res = await api.post("/v1/admin/staff", payload);
  return {
    member: res.data.data as StaffMember,
    message: String(res.data.message ?? ""),
  };
}

export async function updateStaff(id: number, payload: Partial<{
  name: string;
  phone: string;
  staff_type: "internal" | "external";
  status: "active" | "inactive";
  availability: "available" | "unavailable";
  specializations: string[];
}>): Promise<StaffMember> {
  const res = await api.post(`/v1/admin/staff/${id}`, payload);
  return res.data.data as StaffMember;
}

export async function resendStaffInvite(id: number): Promise<StaffMember> {
  const res = await api.post(`/v1/admin/staff/${id}/invite`);
  return res.data.data as StaffMember;
}

export async function acceptStaffInvite(token: string): Promise<{ message: string; email?: string }> {
  const res = await api.post("/v1/staff/invitations/accept", { token });
  return res.data;
}
