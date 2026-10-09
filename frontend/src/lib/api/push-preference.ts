import api from "@/lib/api/client";

export async function fetchPushNotificationPreference(): Promise<{ enabled: boolean }> {
  const res = await api.get("/v1/me/push-notifications");
  return { enabled: Boolean(res.data?.data?.enabled) };
}

export async function updatePushNotificationPreference(enabled: boolean): Promise<{ enabled: boolean }> {
  const res = await api.patch("/v1/me/push-notifications", { enabled });
  return { enabled: Boolean(res.data?.data?.enabled) };
}
