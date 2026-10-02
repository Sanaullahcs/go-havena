/**
 * Run: npx tsx scripts/test-notification-feed-module.ts
 */
import {
  classifyNotificationModule,
  filterNotificationsByModule,
} from "../src/lib/notifications/notification-feed-module";
import type { AppNotification } from "../src/components/shared/notification-bell";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

const base = (over: Partial<AppNotification>): AppNotification => ({
  id: 1,
  type: "info",
  title: "",
  time: "",
  read: false,
  ...over,
});

console.log("\nNotification feed module classification");
{
  assert(
    classifyNotificationModule(base({ title: "New Event", actionUrl: "/notices/5", noticeCategory: "event" }))
      === "events",
    "event notice",
  );
  assert(
    classifyNotificationModule(base({ title: "New Notice", actionUrl: "/notices/2", noticeCategory: "general" }))
      === "notices",
    "general notice",
  );
  assert(
    classifyNotificationModule(base({ title: "Reservation approved", actionUrl: "/screens/admin-bookings" }))
      === "amenities",
    "amenity booking",
  );
  assert(
    classifyNotificationModule(base({ title: "Community membership", body: "Welcome" })) === "others",
    "membership",
  );

  const list = [
    base({ id: 1, title: "New Event", noticeCategory: "event", actionUrl: "/notices/1" }),
    base({ id: 2, title: "New Notice", noticeCategory: "general", actionUrl: "/notices/2" }),
  ];
  assert(filterNotificationsByModule(list, "events").length === 1, "filter events");
}

console.log(failed === 0 ? `\nAll ${passed} tests passed.\n` : `\n${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
