/**
 * Run: node scripts/test-home-sections.mjs
 */
import { HOME_SECTION_CARD_LIMIT } from "../constants/home-sections.js";

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${label}`);
}

function pickNotices(notices, limit = HOME_SECTION_CARD_LIMIT) {
  return [...notices]
    .sort((a, b) => {
      const aPin = a.isPinned ? 1 : 0;
      const bPin = b.isPinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    })
    .slice(0, limit);
}

function pickEvents(events, limit = HOME_SECTION_CARD_LIMIT) {
  return [...events]
    .sort((a, b) => {
      const aPin = a.isPinned ? 1 : 0;
      const bPin = b.isPinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
    })
    .slice(0, limit);
}

function pickDeals(deals, limit = HOME_SECTION_CARD_LIMIT) {
  return [...deals]
    .sort((a, b) => {
      const aFeatured = a.isTrending ? 1 : 0;
      const bFeatured = b.isTrending ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, limit);
}

function pickPosts(posts, limit = HOME_SECTION_CARD_LIMIT) {
  return [...posts]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

console.log("\n=== Home section card limit ===");
assert("limit constant is 4", HOME_SECTION_CARD_LIMIT === 4);

console.log("\n=== Notices carousel ===");
const notices = pickNotices([
  { id: 1, isPinned: false, publishedAt: "2026-07-20T10:00:00Z" },
  { id: 2, isPinned: true, publishedAt: "2026-07-10T10:00:00Z" },
  { id: 3, isPinned: false, publishedAt: "2026-07-22T10:00:00Z" },
  { id: 4, isPinned: false, publishedAt: "2026-07-21T10:00:00Z" },
  { id: 5, isPinned: false, publishedAt: "2026-07-23T10:00:00Z" },
  { id: 6, isPinned: false, publishedAt: "2026-07-19T10:00:00Z" },
]);
assert("notices limited to 4", notices.length === 4);
assert("pinned notice is first", notices[0].id === 2);
assert("newest unpinned follow pin", notices[1].id === 5);

console.log("\n=== Events ===");
const events = pickEvents([
  { id: 10, isPinned: false, eventDate: "2099-12-01" },
  { id: 11, isPinned: true, eventDate: "2099-11-01" },
  { id: 12, isPinned: false, eventDate: "2099-10-01" },
  { id: 13, isPinned: false, eventDate: "2099-09-01" },
  { id: 14, isPinned: false, eventDate: "2099-08-01" },
  { id: 15, isPinned: false, eventDate: "2099-07-01" },
]);
assert("events limited to 4", events.length === 4);
assert("pinned event is first", events[0].id === 11);

console.log("\n=== Deals ===");
const deals = pickDeals([
  { id: 20, isTrending: false, createdAt: "2026-07-20T10:00:00Z" },
  { id: 21, isTrending: true, createdAt: "2026-07-01T10:00:00Z" },
  { id: 22, isTrending: false, createdAt: "2026-07-22T10:00:00Z" },
  { id: 23, isTrending: false, createdAt: "2026-07-21T10:00:00Z" },
  { id: 24, isTrending: false, createdAt: "2026-07-23T10:00:00Z" },
  { id: 25, isTrending: false, createdAt: "2026-07-19T10:00:00Z" },
]);
assert("deals limited to 4", deals.length === 4);
assert("featured deal is first", deals[0].id === 21);
assert("newest non-featured after featured", deals[1].id === 24);

console.log("\n=== Community posts ===");
const posts = pickPosts([
  { id: 30, created_at: "2026-07-20T10:00:00Z" },
  { id: 31, created_at: "2026-07-23T10:00:00Z" },
  { id: 32, created_at: "2026-07-21T10:00:00Z" },
  { id: 33, created_at: "2026-07-22T10:00:00Z" },
  { id: 34, created_at: "2026-07-19T10:00:00Z" },
  { id: 35, created_at: "2026-07-18T10:00:00Z" },
]);
assert("posts limited to 4", posts.length === 4);
assert("newest post first", posts[0].id === 31);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
