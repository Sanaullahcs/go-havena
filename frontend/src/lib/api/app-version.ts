import api from "./client";

export type AppPlatformVersionSettings = {
  latest_version: string;
  minimum_version: string;
  force_update: boolean;
  store_url: string;
};

export type AppVersionSettings = {
  ios: AppPlatformVersionSettings;
  android: AppPlatformVersionSettings;
  updated_at?: string | null;
};

export type SendUpdateNotificationResult = {
  users_notified: number;
  tokens_targeted: number;
  platform: string;
};

export async function fetchAppVersionSettings(): Promise<AppVersionSettings> {
  const { data } = await api.get("/v1/admin/app-version/settings");
  return data.data as AppVersionSettings;
}

export async function updateAppVersionSettings(
  payload: Omit<AppVersionSettings, "updated_at">,
): Promise<AppVersionSettings> {
  const { data } = await api.put("/v1/admin/app-version/settings", payload);
  return data.data as AppVersionSettings;
}

export async function sendAppUpdateNotification(
  platform: "ios" | "android" | "all" = "all",
): Promise<SendUpdateNotificationResult> {
  const { data } = await api.post("/v1/admin/app-version/send-update-notification", {
    platform,
  });
  return data.data as SendUpdateNotificationResult;
}
