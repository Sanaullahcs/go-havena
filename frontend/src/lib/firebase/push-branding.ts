export const WEB_PUSH_ICON = "/app-icon.png";
export const WEB_PUSH_BADGE = "/app-icon.png";

export function absoluteWebPushIcon(origin?: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${WEB_PUSH_ICON}`;
  }
  if (origin) {
    return `${origin.replace(/\/$/, "")}${WEB_PUSH_ICON}`;
  }
  return WEB_PUSH_ICON;
}
