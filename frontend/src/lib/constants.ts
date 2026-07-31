import { resolveApiV1Base } from "@/lib/api/resolve-base-url";

export const APP_NAME = "NeighborLink";

export const API_BASE_URL = resolveApiV1Base();

export const BRAND = {
  primary: "#007BFF",
  primaryDeep: "#0052DF",
  text: "#11181C",
  muted: "#6A7282",
} as const;
