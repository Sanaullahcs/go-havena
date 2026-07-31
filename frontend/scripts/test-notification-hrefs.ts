/**
 * Notification href mapping smoke checks.
 * Usage: npx tsx scripts/test-notification-hrefs.ts
 */
import {
  resolveAdminNotificationHref,
} from "../src/lib/notifications/resolve-admin-notification-href";
import {
  resolvePortalNotificationHref,
} from "../src/lib/notifications/resolve-portal-notification-href";
import { resolvePushLink } from "../src/lib/firebase/display-web-push-notification";

let passed = 0;
let failed = 0;

function assertOk(cond: boolean, label: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}`);
  }
}

console.log("Notification href mapping\n");

assertOk(
  resolveAdminNotificationHref("/notices/12", "info", { category: "event" }) ===
    "/admin/events?notice=12",
  "event notice id → admin events",
);
assertOk(
  resolveAdminNotificationHref("/notices/9", "info", { category: "emergency" }) ===
    "/admin/alerts?notice=9",
  "alert notice id → admin alerts",
);
assertOk(
  resolveAdminNotificationHref("/screens/notices", "success") === "/admin/notices",
  "legacy /screens/notices → admin notices",
);
assertOk(
  resolveAdminNotificationHref("/screens/admin-content-review?kind=event", "info") ===
    "/admin/events?review_status=pending",
  "pending event review → admin events pending",
);
assertOk(
  resolveAdminNotificationHref("/screens/admin-bookings", "info") === "/admin/bookings",
  "admin bookings screen → bookings",
);
assertOk(
  resolveAdminNotificationHref("/screens/property-management/my-booking", "success") ===
    "/admin/amenities",
  "my booking → amenities",
);
assertOk(
  resolveAdminNotificationHref("/broken/path", "info") === "/admin/notifications",
  "unknown path → notifications inbox",
);
assertOk(
  resolveAdminNotificationHref("/screens/does-not-exist", "info") === "/admin/notifications",
  "unknown screen → notifications inbox",
);
assertOk(resolveAdminNotificationHref(null, "message") === "/admin/messages", "message type fallback");
assertOk(resolveAdminNotificationHref(null, "warning") === "/admin/moderation", "warning type fallback");
assertOk(resolveAdminNotificationHref(null, "info") === null, "info with no url stays null");
assertOk(resolvePushLink("/unknown/route") === "/admin/notifications", "push link unknown → inbox");
assertOk(resolvePushLink(null) === "/admin/notifications", "push link empty → inbox");

assertOk(
  resolveAdminNotificationHref("/screens/community-feed/comments?postId=42", "info") ===
    "/admin/feed?post=42",
  "admin: post comment/like → admin feed post",
);
assertOk(
  resolveAdminNotificationHref("/screens/community-feed", "info") === "/admin/feed",
  "admin: community feed → admin feed",
);
assertOk(
  resolvePortalNotificationHref("/screens/community-feed/comments?postId=42", "info") ===
    "/feed?post=42",
  "portal: post comment/like/create → portal feed post",
);
assertOk(
  resolvePortalNotificationHref("/screens/community-feed", "info") === "/feed",
  "portal: community feed → portal feed",
);
assertOk(
  resolvePortalNotificationHref("/admin/feed?post=9", "info", { title: "New community post" }) ===
    "/feed",
  "portal: admin feed url remapped away from admin",
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
