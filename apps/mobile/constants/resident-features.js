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

export function flagsFromUser(user) {
  const payload = user?.resident_features;
  const flags = Object.fromEntries(RESIDENT_FEATURE_KEYS.map((key) => [key, true]));
  const incoming = payload?.features ?? {};
  Object.entries(incoming).forEach(([key, enabled]) => {
    flags[key] = Boolean(enabled);
  });
  return flags;
}

export function isResidentFeatureEnabled(user, key) {
  return flagsFromUser(user)[key] !== false;
}

export function anyResidentFeatureEnabled(user, keys) {
  return keys.some((key) => isResidentFeatureEnabled(user, key));
}

export function catalogFromUser(user) {
  return user?.resident_features?.catalog ?? [];
}
