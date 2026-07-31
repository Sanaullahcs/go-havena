import api from "./client";
import type { WebUser } from "@/lib/auth/session";

export type MeProfileRegion = {
  id: number;
  title: string;
  area?: string;
  state?: string;
};

export type MeProfileMembership = {
  id: number;
  community_id: number;
  role: string;
  status: string;
  community?: {
    id: number;
    name: string;
    region?: string;
    region_id?: number;
    address?: string;
    status?: string;
    review_status?: string;
  } | null;
};

export type MeProfile = {
  id: number;
  uuid?: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status?: string;
  community_admin_status?: string | null;
  profile?: {
    display_name?: string;
    avatar_url?: string | null;
    bio?: string | null;
    unit_number?: string | null;
    residence_type?: string | null;
    region_id?: number | null;
    region?: MeProfileRegion | null;
  } | null;
  memberships?: MeProfileMembership[];
};

export function meToSessionUser(me: MeProfile): Partial<WebUser> {
  const adminMembership = me.memberships?.find(
    (m) => m.status === "approved" && ["admin", "moderator"].includes(m.role),
  );
  const approved = adminMembership ?? me.memberships?.find((m) => m.status === "approved");
  return {
    id: me.id,
    email: me.email,
    phone: me.phone ?? undefined,
    name: me.name,
    role: me.role,
    community_admin_status: me.community_admin_status,
    community_id: approved?.community_id ?? me.memberships?.[0]?.community_id,
    memberships: me.memberships?.map((m) => ({
      id: m.id,
      community_id: m.community_id,
      role: m.role,
      status: m.status,
      community: m.community ? { id: m.community.id, name: m.community.name } : undefined,
    })),
    profile: {
      display_name: me.profile?.display_name ?? me.name,
      avatar: me.profile?.avatar_url ?? undefined,
      avatar_url: me.profile?.avatar_url ?? undefined,
    },
  };
}

export async function fetchMe(): Promise<MeProfile> {
  const res = await api.get("/v1/me");
  return res.data.data as MeProfile;
}

export async function updateMe(data: {
  name?: string;
  phone?: string;
  display_name?: string;
  bio?: string;
  unit_number?: string;
}): Promise<MeProfile> {
  const res = await api.put("/v1/me", data);
  return res.data.data as MeProfile;
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("avatar", file);
  const res = await api.post("/v1/me/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as { avatar_url: string };
}

export async function changePassword(data: {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}) {
  return api.put("/v1/me/password", data);
}
