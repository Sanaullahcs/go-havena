/**
 * Run: node apps/mobile/scripts/test-notice-home-expiry.mjs
 */
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOME_SECTION_CARD_LIMIT } from "../constants/home-sections.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  isNoticeExpiredForHome,
  isCarouselNotice,
} = await import(pathToFileURL(join(root, "utils/notice-home-expiry.js")).href);

function pickNeighborhoodCarousel(notices, limit = HOME_SECTION_CARD_LIMIT) {
  return [...notices]
    .filter(isCarouselNotice)
    .filter((n) => !isNoticeExpiredForHome(n))
    .slice(0, limit);
}

function pickUpcomingEvents(notices, limit = HOME_SECTION_CARD_LIMIT) {
  return notices
    .filter((n) => n.category === "event" || n.isEvent)
    .filter((n) => !isNoticeExpiredForHome(n))
    .slice(0, limit);
}

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pastTime24h() {
  const d = new Date(Date.now() - 2 * 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function futureTime24h() {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

console.log("\n=== isNoticeExpiredForHome ===");

assert(
  "legacy alert without schedule stays visible",
  !isNoticeExpiredForHome({ category: "emergency", title: "Storm watch", isAlert: true }),
);

assert(
  "undated general notice stays visible",
  !isNoticeExpiredForHome({ category: "general", title: "Welcome" }),
);

assert(
  "undated finance bill stays on home",
  !isNoticeExpiredForHome({ category: "finance", title: "New Service Bill" }),
);

assert(
  "paid finance bill with past date is hidden from home",
  isNoticeExpiredForHome({
    category: "finance",
    title: "New Service Bill",
    event_date: yesterdayKey(),
  }),
);

assert(
  "undated event stays visible",
  !isNoticeExpiredForHome({ category: "event", title: "Old BBQ", isEvent: true }),
);

assert(
  "maintenance notice with past date is expired",
  isNoticeExpiredForHome({
    category: "maintenance",
    event_date: yesterdayKey(),
    event_time: "09:00",
    event_time_end: "17:00",
  }),
);

assert(
  "general notice with past end time today is expired",
  isNoticeExpiredForHome(
    {
      category: "general",
      event_date: todayKey(),
      event_time: "00:00",
      event_time_end: "00:01",
    },
    new Date(`${todayKey()}T12:00:00`),
  ),
);

assert(
  "general notice with future end time today stays visible",
  !isNoticeExpiredForHome({
    category: "general",
    event_date: todayKey(),
    event_time: "09:00",
    event_time_end: futureTime24h(),
  }),
);

assert(
  "event with past end time today is expired",
  isNoticeExpiredForHome(
    {
      category: "event",
      event_date: todayKey(),
      event_time: "09:00",
      event_time_end: pastTime24h(),
    },
    new Date(`${todayKey()}T23:59:00`),
  ),
);

assert(
  "future scheduled notice stays visible",
  !isNoticeExpiredForHome({
    category: "security",
    event_date: tomorrowKey(),
    event_time: "10:00",
    event_time_end: "12:00",
  }),
);

assert(
  "multi-day notice stays visible before end date",
  !isNoticeExpiredForHome({
    category: "general",
    event_date: yesterdayKey(),
    event_end_date: tomorrowKey(),
    event_time: "09:00",
    event_time_end: "17:00",
  }),
);

console.log("\n=== pickNeighborhoodCarousel filters expired ===");
const carousel = pickNeighborhoodCarousel([
  { id: 1, category: "general", title: "Active", event_date: tomorrowKey() },
  {
    id: 2,
    category: "maintenance",
    title: "Expired window",
    event_date: yesterdayKey(),
    event_time_end: "17:00",
  },
  {
    id: 3,
    category: "event",
    title: "Should not be in carousel",
    event_date: tomorrowKey(),
    isEvent: true,
  },
]);

assert("carousel excludes expired scheduled notice", carousel.every((n) => n.id !== 2));
assert("carousel excludes events", carousel.every((n) => isCarouselNotice(n)));
assert("carousel keeps unscheduled notice", carousel.some((n) => n.id === 1));

console.log("\n=== pickUpcomingEvents filters expired ===");
const events = pickUpcomingEvents([
  {
    id: 10,
    category: "event",
    isEvent: true,
    event_date: todayKey(),
    event_time_end: pastTime24h(),
  },
  {
    id: 11,
    category: "event",
    isEvent: true,
    event_date: tomorrowKey(),
    event_time_end: "20:00",
  },
  {
    id: 12,
    category: "event",
    isEvent: true,
    event_date: yesterdayKey(),
    event_time_end: "20:00",
  },
]);

assert(
  "happening soon keeps tomorrow only, hides yesterday and ended today",
  events.length === 1 && events.some((e) => e.id === 11),
);

console.log("");
if (failed > 0) {
  console.error(`FAILED: ${failed}, passed ${passed}`);
  process.exit(1);
}
console.log(`All ${passed} notice home expiry tests passed.`);
