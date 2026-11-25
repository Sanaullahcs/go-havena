import { resolveApiV1Base } from "@/lib/api/resolve-base-url";

export const APP_NAME = "Havena";

export const API_BASE_URL = resolveApiV1Base();

/** Harbor Trust — professional community palette */
export const BRAND = {
  navy: "#1B4F8A",
  deepTeal: "#163A66",
  teal: "#1B4F8A",
  mint: "#E8F0F7",
  canvas: "#F6F8FB",
  primary: "#1B4F8A",
  text: "#1B4F8A",
  muted: "#5B6B7C",
} as const;
