import api from "./client";

export type ProvisionUserType = "community_admin" | "resident";

export interface ProvisionUserPayload {
  type: ProvisionUserType;
  name?: string;
  email: string;
  phone: string;
  region_id: number;
  community_name?: string;
  community_address?: string;
  community_description?: string;
  community_id?: number;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ProvisionedUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  community_admin_status: string | null;
  status: string;
  region_id: number | null;
  email_sent?: boolean;
  invite_code?: string | null;
  invite_qr_value?: string | null;
  temp_password?: string | null;
  expires_at?: string | null;
  member_name?: string | null;
  member_email?: string | null;
  community_name?: string | null;
  membership: {
    community_id: number;
    role: string;
    status: string;
  } | null;
  community: {
    id: number;
    name: string;
    region_id: number | null;
    region: string | null;
  };
}

export async function provisionAdminUser(payload: ProvisionUserPayload) {
  const res = await api.post("/v1/admin/users", payload);
  return res.data as { data: ProvisionedUser; message: string; email_sent?: boolean };
}
