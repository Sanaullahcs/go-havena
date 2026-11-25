import api from "@/lib/api/client";

export async function registerFcmDevice(fcmToken: string) {
  const res = await api.post("/v1/devices", {
    fcm_token: fcmToken,
    platform: "web",
  });
  return res.data;
}

export async function unregisterFcmDevice(fcmToken?: string) {
  const res = await api.delete("/v1/devices", {
    data: fcmToken ? { fcm_token: fcmToken, platform: "web" } : { platform: "web" },
  });
  return res.data;
}

export async function sendTestPush(payload?: { title?: string; body?: string }) {
  const res = await api.post("/v1/devices/test-push", payload ?? {});
  return res.data;
}
