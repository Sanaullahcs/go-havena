export const RESIDENT_FEATURE_KEYS = [
  "feed",
  "notices",
  "events",
  "alerts",
  "messages",
  "marketplace",
  "amenities",
  "bookings",
  "documents",
  "community_rules",
  "wellness",
  "family",
  "guest_invites",
  "points",
  "nearby_places",
  "refer_and_earn",
];

export function serverFeatureFlags(user) {
  const features = user?.resident_features?.features;
  if (!features || typeof features !== "object") return null;
  return features;
}

export function flagsFromUser(user) {
  const incoming = serverFeatureFlags(user) ?? {};
  const flags = {};
  RESIDENT_FEATURE_KEYS.forEach((key) => {
    flags[key] = incoming[key] === true;
  });
  return flags;
}

/** True only when the latest account payload explicitly enables the feature. */
export function isResidentFeatureEnabled(user, key) {
  return serverFeatureFlags(user)?.[key] === true;
}

/**
 * Home sections stay visible unless this community's payload explicitly
 * turns that feature off. A missing flag keeps the section, matching the
 * server default.
 */
export function isHomeSectionEnabled(user, key) {
  const value = serverFeatureFlags(user)?.[key];
  return value !== false && value !== 0 && value !== "0" && value !== "false";
}

/** Create sheet and the center tab button share this so a disabled feature cannot be started. */
export function canOfferCreateAction(user, { isAdmin = false, allowResidentEvent = false } = {}) {
  if (isResidentFeatureEnabled(user, "feed")) return true;
  if (isResidentFeatureEnabled(user, "marketplace")) return true;
  if ((isAdmin || allowResidentEvent) && isResidentFeatureEnabled(user, "events")) return true;
  if (!isAdmin) return false;
  return (
    isResidentFeatureEnabled(user, "notices") ||
    isResidentFeatureEnabled(user, "alerts") ||
    isResidentFeatureEnabled(user, "community_rules") ||
    isResidentFeatureEnabled(user, "documents")
  );
}

const SERVICE_ROUTE_FEATURES = {
  AMENITY: "amenities",
  AMENITY_FORM: "amenities",
  ADMIN_AMENITIES: "amenities",
  AMENITY_BILLS: "amenities",
  ADMIN_AMENITY_BILLS: "amenities",
  MY_BOOKING: "bookings",
  ADMIN_BOOKINGS: "bookings",
  COMMUNITY_RULES: "community_rules",
  RULE_DETAIL: "community_rules",
  RULE_FORM: "community_rules",
  DOCUMENTS: "documents",
  DOCUMENT_FORM: "documents",
};

export function isServiceRouteEnabled(user, routeKey) {
  const key = SERVICE_ROUTE_FEATURES[routeKey];
  return !key || isResidentFeatureEnabled(user, key);
}

const REVIEW_ACTION_FEATURES = {
  post: "feed",
  notice: "notices",
  event: "events",
  alert: "alerts",
  listing: "marketplace",
  business: "marketplace",
  booking: "bookings",
  family_add_member: "family",
};

export function isReviewActionEnabled(user, actionType) {
  const key = REVIEW_ACTION_FEATURES[actionType];
  return !key || isResidentFeatureEnabled(user, key);
}

export function anyResidentFeatureEnabled(user, keys) {
  return keys.some((key) => isResidentFeatureEnabled(user, key));
}

export function catalogFromUser(user) {
  return user?.resident_features?.catalog ?? [];
}
