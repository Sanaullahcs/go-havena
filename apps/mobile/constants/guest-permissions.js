/** Guest feature access toggles — keep in sync with GuestAccessService::PERMISSION_KEYS. */

export const GUEST_PERMISSION_OPTIONS = [
  {
    key: "feed",
    labelKey: "guestPermissions.feedLabel",
    descriptionKey: "guestPermissions.feedDesc",
    icon: "message-circle",
  },
  {
    key: "notices",
    labelKey: "guestPermissions.noticesLabel",
    descriptionKey: "guestPermissions.noticesDesc",
    icon: "clipboard",
  },
  {
    key: "events",
    labelKey: "guestPermissions.eventsLabel",
    descriptionKey: "guestPermissions.eventsDesc",
    icon: "calendar",
  },
  {
    key: "marketplace",
    labelKey: "guestPermissions.marketplaceLabel",
    descriptionKey: "guestPermissions.marketplaceDesc",
    icon: "shopping-bag",
  },
  {
    key: "businesses",
    labelKey: "guestPermissions.businessesLabel",
    descriptionKey: "guestPermissions.businessesDesc",
    icon: "briefcase",
  },
  {
    key: "wellness",
    labelKey: "guestPermissions.wellnessLabel",
    descriptionKey: "guestPermissions.wellnessDesc",
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
