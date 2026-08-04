import { resolveApiV1Base } from "@/lib/api/resolve-base-url";

export const APP_NAME = "Havena";

export const API_BASE_URL = resolveApiV1Base();

/** Ocean Breeze brand palette */
export const BRAND = {
  primary: "#14B8A6",
  secondaryNavy: "#0A2A43",
  secondaryDarkTeal: "#0D9488",
  secondaryTurquoise: "#0D9488",
  secondaryGreen: "#0D9488",
  softMint: "#D1FAF5",
  canvas: "#F4F8FD",
  text: "#0A2A43",
  muted: "#6B7280",
} as const;
