import type { WebPushMessagePayload } from "@/lib/firebase/display-web-push-notification";

type ForegroundNotificationListener = (payload: WebPushMessagePayload) => void;

const listeners = new Set<ForegroundNotificationListener>();

export function subscribeForegroundNotification(listener: ForegroundNotificationListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitForegroundNotification(payload: WebPushMessagePayload) {
  listeners.forEach((listener) => listener(payload));
}
