import api from "./client";
import type { CommunityAdminAccess, WebUser } from "@/lib/auth/session";
import type { ResidentFeaturesPayload } from "@/lib/resident-features";

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
  invite_code_used?: string | null;
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
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    unit_number?: string | null;
    residence_type?: string | null;
    office_address?: string | null;
    utility_bill_url?: string | null;
    utility_bill_review_status?: string | null;
    region_id?: number | null;
    region?: MeProfileRegion | null;
  } | null;
  memberships?: MeProfileMembership[];
  access?: CommunityAdminAccess | null;
  resident_features?: ResidentFeaturesPayload | null;
  active_context?: "community_admin" | "resident" | string | null;
  active_mode?: "community_admin" | "resident" | string | null;
  active_context_community_id?: number | null;
  can_switch_modes?: boolean;
  can_use_admin_mode?: boolean;
  can_use_resident_mode?: boolean;
  resident_mode_communities?: Array<{ id: number; name: string }>;
};

export function meToSessionUser(me: MeProfile): Partial<WebUser> {
  const adminMembership = me.memberships?.find(
    (m) => m.status === "approved" && ["admin", "moderator"].includes(m.role),
  );
  const pendingAdmin = me.memberships?.find(
    (m) => m.status === "pending" && m.role === "admin",
  );
  const approved = adminMembership ?? me.memberships?.find((m) => m.status === "approved");
  const linked = approved ?? pendingAdmin ?? me.memberships?.[0];
  return {
    id: me.id,
    email: me.email,
    phone: me.phone ?? undefined,
    name: me.name,
    role: me.role,
    community_admin_status: me.community_admin_status,
    community_id: linked?.community_id ?? me.access?.community_id ?? undefined,
    memberships: me.memberships?.map((m) => ({
      id: m.id,
      community_id: m.community_id,
      role: m.role,
      status: m.status,
      community: m.community
        ? {
            id: m.community.id,
            name: m.community.name,
            review_status: m.community.review_status,
          }
        : undefined,
    })),
    profile: {
      display_name: me.profile?.display_name ?? me.name,
      avatar: me.profile?.avatar_url ?? undefined,
      avatar_url: me.profile?.avatar_url ?? undefined,
    },
    access: me.access ?? null,
    resident_features: me.resident_features ?? null,
    active_context: me.active_context ?? me.active_mode ?? null,
    active_mode: me.active_mode ?? me.active_context ?? null,
    active_context_community_id: me.active_context_community_id ?? null,
    can_switch_modes: Boolean(me.can_switch_modes ?? me.can_use_admin_mode ?? me.can_use_resident_mode),
    can_use_admin_mode: Boolean(me.can_use_admin_mode ?? me.can_switch_modes ?? me.can_use_resident_mode),
    can_use_resident_mode: Boolean(me.can_use_resident_mode ?? me.can_switch_modes ?? me.can_use_admin_mode),
    resident_mode_communities: me.resident_mode_communities ?? [],
  };
}

export async function switchActiveContext(
  context: "resident" | "community_admin",
  communityId?: number,
): Promise<MeProfile> {
  const res = await api.put("/v1/me/active-context", {
    context,
    active_mode: context,
    community_id: communityId,
  });
  return res.data.data as MeProfile;
}

export async function fetchMe(): Promise<MeProfile> {
  const res = await api.get("/v1/me");
  return res.data.data as MeProfile;
}

export async function updateMe(data: {
  name?: string;
  email?: string;
  phone?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  bio?: string;
  unit_number?: string;
  residence_type?: string;
  office_address?: string;
  region_id?: number | null;
}): Promise<MeProfile> {
  const res = await api.post("/v1/me", data);
  return res.data.data as MeProfile;
}

export async function uploadUtilityBill(file: File): Promise<{ utility_bill_url: string }> {
  const form = new FormData();
  form.append("utility_bill", file);
  const res = await api.post("/v1/me/utility-bill", form);
  return res.data.data as { utility_bill_url: string };
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("avatar", file);
  const res = await api.post("/v1/me/avatar", form);
  return res.data.data as { avatar_url: string };
}

export async function changePassword(data: {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}) {
  return api.put("/v1/me/password", data);
}
