/** Guest feature access toggles — keep in sync with GuestAccessService::PERMISSION_KEYS. */

export const GUEST_PERMISSION_OPTIONS = [
  {
    key: "feed",
    label: "Community feed",
    description: "Posts, updates, and neighborhood conversations",
    icon: "message-circle",
  },
  {
    key: "notices",
    label: "Notice board",
    description: "General, maintenance, security, and finance notices",
    icon: "clipboard",
  },
  {
    key: "events",
    label: "Events",
    description: "Community events and RSVPs",
    icon: "calendar",
  },
  {
    key: "marketplace",
    label: "Marketplace",
    description: "Listings, deals, and resident offers",
    icon: "shopping-bag",
  },
  {
    key: "businesses",
    label: "Local businesses",
    description: "Business directory and provider profiles",
    icon: "briefcase",
  },
  {
    key: "wellness",
    label: "Wellness",
    description: "Wellness programs, courses, and lessons",
    icon: "heart",
  },
];

export const DEFAULT_GUEST_PERMISSIONS = Object.fromEntries(
  GUEST_PERMISSION_OPTIONS.map((option) => [option.key, true]),
);

export function normalizeGuestPermissions(permissions) {
  const next = { ...DEFAULT_GUEST_PERMISSIONS };
  if (!permissions || typeof permissions !== "object") return next;

  for (const option of GUEST_PERMISSION_OPTIONS) {
    if (typeof permissions[option.key] === "boolean") {
      next[option.key] = permissions[option.key];
    }
  }

  return next;
}

export function guestCanAccessFeature(user, feature) {
  const permissions = user?.guest_access?.permissions;
  if (!permissions) return true;
  return permissions[feature] !== false;
}
