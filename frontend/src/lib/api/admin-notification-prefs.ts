import api from "@/lib/api/client";
import {
  DEFAULT_ADMIN_NOTIFICATION_PREFS,
  type AdminNotificationPrefs,
} from "@/lib/admin/profile-utils";

type PreferencePayload = {
  new_member_alerts?: boolean;
  moderation_alerts?: boolean;
  system_alerts?: boolean;
  weekly_digest?: boolean;
};

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function adminNotificationPrefsFromApi(data?: PreferencePayload | null): AdminNotificationPrefs {
  return {
    newMemberAlerts: flag(data?.new_member_alerts, DEFAULT_ADMIN_NOTIFICATION_PREFS.newMemberAlerts),
    moderationAlerts: flag(data?.moderation_alerts, DEFAULT_ADMIN_NOTIFICATION_PREFS.moderationAlerts),
    systemAlerts: flag(data?.system_alerts, DEFAULT_ADMIN_NOTIFICATION_PREFS.systemAlerts),
    weeklyDigest: flag(data?.weekly_digest, DEFAULT_ADMIN_NOTIFICATION_PREFS.weeklyDigest),
  };
}

export function adminNotificationPrefsToApi(prefs: AdminNotificationPrefs): Required<PreferencePayload> {
  return {
    new_member_alerts: prefs.newMemberAlerts,
    moderation_alerts: prefs.moderationAlerts,
    system_alerts: prefs.systemAlerts,
    weekly_digest: prefs.weeklyDigest,
  };
}

export async function fetchAdminNotificationPrefs(): Promise<AdminNotificationPrefs> {
  const res = await api.get("/v1/me/notification-preferences");
  return adminNotificationPrefsFromApi(res.data?.data);
}

export async function updateAdminNotificationPrefs(
  prefs: AdminNotificationPrefs,
): Promise<AdminNotificationPrefs> {
  const res = await api.patch("/v1/me/notification-preferences", adminNotificationPrefsToApi(prefs));
  return adminNotificationPrefsFromApi(res.data?.data);
}
