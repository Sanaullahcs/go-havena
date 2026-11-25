export type ResidentFeatureKey =
  | "feed"
  | "notices"
  | "events"
  | "alerts"
  | "messages"
  | "marketplace"
  | "amenities"
  | "bookings"
  | "documents"
  | "community_rules"
  | "wellness"
  | "family"
  | "guest_invites"
  | "points"
  | "nearby_places"
  | "refer_and_earn";

export type ResidentFeatureItem = {
  key: ResidentFeatureKey | string;
  label: string;
  description: string;
  group: string;
  group_label: string;
  resident_paths?: string[];
  api_prefixes?: string[];
  enabled: boolean;
  disabled_by?: "system_admin" | "community_admin" | null;
};

export type FeatureDisableRequest = {
  id: number;
  community_id: number;
  community_name?: string | null;
  feature_key: string;
  feature_name: string;
  action?: "disable" | "enable" | string;
  reason: string;
  status: "pending" | "approved" | "rejected" | string;
  requested_by?: string | null;
  requested_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export function featureRequestStatusLabel(status?: string | null) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

export function featureRequestActionLabel(action?: string | null) {
  return action === "enable" ? "Enable" : "Disable";
}

export type ResidentFeaturesPayload = {
  configured?: boolean;
  features?: Record<string, boolean>;
  catalog?: ResidentFeatureItem[];
  pending_requests?: FeatureDisableRequest[];
  requests?: FeatureDisableRequest[];
};

export const ADMIN_FEATURE_ROUTES: Array<{ prefix: string; key: string }> = [
  { prefix: "/admin/messages", key: "messages" },
  { prefix: "/admin/notices", key: "notices" },
  { prefix: "/admin/events", key: "events" },
  { prefix: "/admin/alerts", key: "alerts" },
  { prefix: "/admin/community-rules", key: "community_rules" },
  { prefix: "/admin/documents", key: "documents" },
  { prefix: "/admin/agreements", key: "documents" },
  { prefix: "/admin/amenities", key: "amenities" },
  { prefix: "/admin/amenity-bills", key: "amenities" },
  { prefix: "/admin/bookings", key: "bookings" },
  { prefix: "/admin/feed", key: "feed" },
  { prefix: "/admin/marketplace", key: "marketplace" },
  { prefix: "/admin/businesses", key: "marketplace" },
  { prefix: "/admin/guests", key: "guest_invites" },
  { prefix: "/admin/refer-and-earn", key: "refer_and_earn" },
  { prefix: "/admin/local-essentials", key: "nearby_places" },
];

export function adminFeatureForPath(pathname: string): string | null {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const match = ADMIN_FEATURE_ROUTES.find(
    (item) => path === item.prefix || path.startsWith(`${item.prefix}/`),
  );
  return match?.key ?? null;
}

/** Community Admin Adjust Features lists only features a system admin has not turned off. */
export function communityAdjustCatalog(payload?: ResidentFeaturesPayload | null): ResidentFeatureItem[] {
  return (payload?.catalog ?? []).filter((item) => {
    if (item.disabled_by === "system_admin") return false;
    if (item.disabled_by === "community_admin") return true;
    const enabled = payload?.features?.[item.key];
    return enabled !== false && item.enabled !== false;
  });
}

const DEFAULT_ON = true;

export function defaultResidentFlags(catalog?: ResidentFeatureItem[]): Record<string, boolean> {
  if (catalog?.length) {
    return Object.fromEntries(catalog.map((item) => [item.key, true]));
  }
  return {};
}

export function flagsFromPayload(payload?: ResidentFeaturesPayload | null): Record<string, boolean> {
  const flags = { ...defaultResidentFlags(payload?.catalog) };
  if (payload?.features) {
    for (const [key, enabled] of Object.entries(payload.features)) {
      flags[key] = Boolean(enabled);
    }
  } else if (payload?.catalog) {
    for (const item of payload.catalog) {
      flags[item.key] = item.enabled !== false;
    }
  }
  return flags;
}

export function isResidentFeatureEnabled(
  payload: ResidentFeaturesPayload | null | undefined,
  key: string,
): boolean {
  const flags = flagsFromPayload(payload);
  if (Object.keys(flags).length === 0) {
    return DEFAULT_ON;
  }
  return flags[key] !== false;
}

export function anyResidentFeatureEnabled(
  payload: ResidentFeaturesPayload | null | undefined,
  keys: string[],
): boolean {
  return keys.some((key) => isResidentFeatureEnabled(payload, key));
}

export function groupedCatalog(catalog: ResidentFeatureItem[]): Array<{
  group: string;
  group_label: string;
  features: ResidentFeatureItem[];
}> {
  const groups: Array<{ group: string; group_label: string; features: ResidentFeatureItem[] }> = [];
  const index = new Map<string, number>();

  for (const item of catalog) {
    const existing = index.get(item.group);
    if (existing === undefined) {
      index.set(item.group, groups.length);
      groups.push({ group: item.group, group_label: item.group_label, features: [item] });
    } else {
      groups[existing].features.push(item);
    }
  }

  return groups;
}

export const RESIDENT_PATH_FEATURES: Array<{ prefix: string; keys: string[] }> = [
  { prefix: "/feed", keys: ["feed"] },
  { prefix: "/notices", keys: ["notices", "events", "alerts"] },
  { prefix: "/messages", keys: ["messages"] },
  { prefix: "/wellness", keys: ["wellness"] },
  { prefix: "/marketplace", keys: ["marketplace"] },
  { prefix: "/property", keys: ["amenities", "bookings", "documents", "community_rules"] },
];

export function residentPathAllowed(
  pathname: string,
  payload?: ResidentFeaturesPayload | null,
): boolean {
  const match = RESIDENT_PATH_FEATURES.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
  );
  if (!match) return true;
  return anyResidentFeatureEnabled(payload, match.keys);
}
