export type GuestPermissionKey =
  | "feed"
  | "notices"
  | "events"
  | "marketplace"
  | "businesses"
  | "wellness";

export type GuestPermissions = Record<GuestPermissionKey, boolean>;

export const GUEST_PERMISSION_OPTIONS: Array<{
  key: GuestPermissionKey;
  label: string;
  description: string;
}> = [
  { key: "feed", label: "Community feed", description: "Posts and neighborhood updates" },
  { key: "notices", label: "Notice board", description: "General, maintenance, and security notices" },
  { key: "events", label: "Events", description: "Community events and RSVPs" },
  { key: "marketplace", label: "Marketplace", description: "Listings, deals, and offers" },
  { key: "businesses", label: "Local businesses", description: "Business directory" },
  { key: "wellness", label: "Wellness", description: "Wellness programs and lessons" },
];

export const DEFAULT_GUEST_PERMISSIONS: GuestPermissions = {
  feed: true,
  notices: true,
  events: true,
  marketplace: true,
  businesses: true,
  wellness: true,
};

export function normalizeGuestPermissions(
  permissions?: Partial<GuestPermissions> | null,
): GuestPermissions {
  const next = { ...DEFAULT_GUEST_PERMISSIONS };
  if (!permissions) return next;

  for (const option of GUEST_PERMISSION_OPTIONS) {
    if (typeof permissions[option.key] === "boolean") {
      next[option.key] = permissions[option.key] as boolean;
    }
  }

  return next;
}
