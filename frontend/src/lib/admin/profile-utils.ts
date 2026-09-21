import { roleLabel } from "@/lib/api/members";
import type { MeProfile } from "@/lib/api/profile";

export function adminRoleLabel(role?: string | null): string {
  switch (role) {
    case "system_admin":
    case "admin":
      return "System Administrator";
    case "community_admin":
      return "Community Administrator";
    case "moderator":
      return "Moderator";
    default:
      return role ? roleLabel(role) : "Administrator";
  }
}

export function accountStatusLabel(status?: string | null): string {
  switch (status) {
    case "active":
      return "Active";
    case "suspended":
    case "banned":
      return "Suspended";
    case "pending":
      return "Pending";
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Active";
  }
}

export function managedCommunities(me: MeProfile | null): { id: number; name: string; status: string }[] {
  if (!me?.memberships?.length) return [];
  return me.memberships
    .filter((m) => m.community && ["admin", "moderator"].includes(m.role))
    .map((m) => ({
      id: m.community_id,
      name: m.community?.name ?? `Community #${m.community_id}`,
      status: m.status,
    }));
}

export type AdminNotificationPrefs = {
  newMemberAlerts: boolean;
  moderationAlerts: boolean;
  systemAlerts: boolean;
  weeklyDigest: boolean;
};

export const DEFAULT_ADMIN_NOTIFICATION_PREFS: AdminNotificationPrefs = {
  newMemberAlerts: true,
  moderationAlerts: true,
  systemAlerts: true,
  weeklyDigest: false,
};

const PREFS_STORAGE_PREFIX = "nbr_admin_notif_prefs_";

export function loadAdminNotificationPrefs(userId?: number | null): AdminNotificationPrefs {
  if (typeof window === "undefined" || !userId) return { ...DEFAULT_ADMIN_NOTIFICATION_PREFS };
  try {
    const raw = localStorage.getItem(`${PREFS_STORAGE_PREFIX}${userId}`);
    if (!raw) return { ...DEFAULT_ADMIN_NOTIFICATION_PREFS };
    return { ...DEFAULT_ADMIN_NOTIFICATION_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_ADMIN_NOTIFICATION_PREFS };
  }
}

export function saveAdminNotificationPrefs(userId: number, prefs: AdminNotificationPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${PREFS_STORAGE_PREFIX}${userId}`, JSON.stringify(prefs));
}

export function profileFormFromMe(me: MeProfile) {
  return {
    name: me.name ?? me.profile?.display_name ?? "",
    phone: me.phone ?? "",
    bio: me.profile?.bio ?? "",
    role: adminRoleLabel(me.role),
    email: me.email ?? "",
    avatarUrl: me.profile?.avatar_url ?? null,
    status: accountStatusLabel(me.status),
    region: me.profile?.region?.title ?? null,
    communities: managedCommunities(me),
  };
}
