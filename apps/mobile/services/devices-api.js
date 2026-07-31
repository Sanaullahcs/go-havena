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

export async function unregisterDevice({ expoPushToken } = {}) {
  return apiRequest("/devices", {
    method: "DELETE",
    body: expoPushToken ? { expo_push_token: expoPushToken } : undefined,
  });
}
