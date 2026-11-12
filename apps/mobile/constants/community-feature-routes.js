import { anyResidentFeatureEnabled } from "./resident-features";
import { isCommunityAdmin } from "../services/community-access";

/**
 * Path rules for screens that belong to a community feature.
 * A screen stays reachable when any of its keys is enabled.
 */
const FEATURE_PATH_RULES = [
  { pattern: /admin-guests|invite-guest|guest-approvals/, keys: ["guest_invites"] },
  { pattern: /reservation-calender|reservation-calendar/, keys: ["bookings"] },
  { pattern: /admin-amenities|admin-amenity-bills|amenity-bills|amenity-form|\/amenity(?:\/|$)/, keys: ["amenities"] },
  { pattern: /admin-bookings|my-booking/, keys: ["bookings"] },
  { pattern: /listing-detail|community-listings|admin-listings|createListing|create-deal|add-business|deal-details|provider-profile|business-deals|\/marketplace|all-businesses|\/deals/, keys: ["marketplace"] },
  { pattern: /refer-and-earn/, keys: ["refer_and_earn"] },
  { pattern: /create-notice/, keys: ["notices"] },
  { pattern: /create-event/, keys: ["events"] },
  { pattern: /create-alert/, keys: ["alerts"] },
  { pattern: /create-post|community-feed|my-posts/, keys: ["feed"] },
  { pattern: /community-rules|rule-form|rule-detail/, keys: ["community_rules"] },
  { pattern: /\/documents/, keys: ["documents"] },
  { pattern: /\/wellness|lessonVedio|wellness-detail/, keys: ["wellness"] },
  { pattern: /my-family/, keys: ["family"] },
  { pattern: /\/messages|\/chat/, keys: ["messages"] },
  { pattern: /nearby-place/, keys: ["nearby_places"] },
  { pattern: /achievements|leaderboard|rank-details|points-history/, keys: ["points"] },
  { pattern: /event-detail/, keys: ["events"] },
  { pattern: /notice-detail|admin-content-review|\/notices\/[^/]+/, keys: ["notices", "events", "alerts"] },
];

/**
 * Switching Community Updates tabs must not send the resident Home.
 * The screen hides disabled sections itself.
 */
function isCommunityUpdatesBoard(path) {
  const value = String(path ?? "").split("?")[0].replace(/\/+$/, "");
  return value === "/notices" || value.endsWith("/(tabs)/notices") || value.endsWith("/tabs/notices");
}

export function isFeaturePathAllowed(pathname, user) {
  const path = String(pathname ?? "");
  if (!user || !path) return true;
  if (isCommunityUpdatesBoard(path)) return true;
  if (/complaints\/(?:chat|report-chat)(?:\/|$|\?)/.test(path)) return true;
  const rule = FEATURE_PATH_RULES.find((item) => item.pattern.test(path));
  if (!rule) return true;
  return anyResidentFeatureEnabled(user, rule.keys);
}

export function featureFallbackPath(user) {
  return isCommunityAdmin(user) ? "/screens/admin-dashboard" : "/(tabs)/home";
}
