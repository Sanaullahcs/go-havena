/** Guest feature access toggles — keep in sync with GuestAccessService::PERMISSION_KEYS. */

import i18n from "../i18n";

export const GUEST_PERMISSION_OPTIONS = [
  {
    key: "feed",
    label: i18n.t("guestPermissions.feedLabel"),
    labelKey: "guestPermissions.feedLabel",
    description: i18n.t("guestPermissions.feedDesc"),
    descriptionKey: "guestPermissions.feedDesc",
    icon: "message-circle",
  },
  {
    key: "notices",
    label: i18n.t("guestPermissions.noticesLabel"),
    labelKey: "guestPermissions.noticesLabel",
    description: i18n.t("guestPermissions.noticesDesc"),
    descriptionKey: "guestPermissions.noticesDesc",
    icon: "clipboard",
  },
  {
    key: "events",
    label: i18n.t("guestPermissions.eventsLabel"),
    labelKey: "guestPermissions.eventsLabel",
    description: i18n.t("guestPermissions.eventsDesc"),
    descriptionKey: "guestPermissions.eventsDesc",
    icon: "calendar",
  },
  {
    key: "marketplace",
    label: i18n.t("guestPermissions.marketplaceLabel"),
    labelKey: "guestPermissions.marketplaceLabel",
    description: i18n.t("guestPermissions.marketplaceDesc"),
    descriptionKey: "guestPermissions.marketplaceDesc",
    icon: "shopping-bag",
  },
  {
    key: "businesses",
    label: i18n.t("guestPermissions.businessesLabel"),
    labelKey: "guestPermissions.businessesLabel",
    description: i18n.t("guestPermissions.businessesDesc"),
    descriptionKey: "guestPermissions.businessesDesc",
    icon: "briefcase",
  },
  {
    key: "wellness",
    label: i18n.t("guestPermissions.wellnessLabel"),
    labelKey: "guestPermissions.wellnessLabel",
    description: i18n.t("guestPermissions.wellnessDesc"),
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
