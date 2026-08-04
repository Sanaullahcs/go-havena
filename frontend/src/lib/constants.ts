import { resolveApiV1Base } from "@/lib/api/resolve-base-url";

export const APP_NAME = "Havena";

export const API_BASE_URL = resolveApiV1Base();

/** Ocean Breeze — five swatches */
export const BRAND = {
  navy: "#0A2A43",
  deepTeal: "#0D9488",
  teal: "#14B8A6",
  mint: "#D1FAF5",
  canvas: "#F4F8FD",
  primary: "#14B8A6",
  text: "#0A2A43",
  muted: "#6B7280",
} as const;
