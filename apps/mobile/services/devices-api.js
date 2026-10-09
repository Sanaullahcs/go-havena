import { apiRequest } from "./api-client";

export async function registerDevice({ expoPushToken, platform }) {
  return apiRequest("/devices", {
    method: "POST",
    body: {
      expo_push_token: expoPushToken,
      platform,
    },
  });
}

export async function fetchAccountPushPreference() {
  const res = await apiRequest("/me/push-notifications");
  return Boolean(res?.data?.enabled);
}

export async function saveAccountPushPreference(enabled) {
  const res = await apiRequest("/me/push-notifications", {
    method: "PATCH",
    body: { enabled: Boolean(enabled) },
  });
  return Boolean(res?.data?.enabled);
}

export async function unregisterDevice({ expoPushToken } = {}) {
  return apiRequest("/devices", {
    method: "DELETE",
    body: expoPushToken ? { expo_push_token: expoPushToken } : undefined,
  });
}
