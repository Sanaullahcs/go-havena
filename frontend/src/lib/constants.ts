import { resolveApiV1Base } from "@/lib/api/resolve-base-url";

export const APP_NAME = "Havena";

export const API_BASE_URL = resolveApiV1Base();

/** Harbor Trust — professional community palette */
export const BRAND = {
  navy: "#0B1C2E",
  deepTeal: "#163A66",
  teal: "#1B4F8A",
  mint: "#E8F0F7",
  canvas: "#F6F8FB",
  primary: "#1B4F8A",
  text: "#0B1C2E",
  muted: "#5B6B7C",
} as const;
