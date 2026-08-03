import { resolveApiV1Base } from "@/lib/api/resolve-base-url";

export const APP_NAME = "Havena";

export const API_BASE_URL = resolveApiV1Base();

export const BRAND = {
  primary: "#00D9B8",
  primaryDeep: "#0A2A43",
  seaGreen: "#148BA6",
  fresh: "#00C988",
  text: "#1F2D3D",
  muted: "#6B7280",
} as const;
