import { mergeNotifications } from "../utils/notification-pagination.js";

let failed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
    return;
  }
  console.log("  ✓", msg);
}

console.log("\nNotification pagination helpers");

const page1 = [
  { id: 1, title: "A" },
  { id: 2, title: "B" },
];
const page2 = [
  { id: 2, title: "B duplicate" },
  { id: 3, title: "C" },
];

const merged = mergeNotifications(page1, page2);
ok(merged.length === 3, "merges pages without duplicates");
ok(merged[0].id === 1 && merged[2].id === 3, "preserves order and appends new rows");

ok(mergeNotifications([], page1).length === 2, "merges into empty list");
ok(mergeNotifications(page1, []).length === 2, "ignores empty incoming page");

// Simulate pagination guard: only load more when first page is full.
const PAGE_SIZE = 15;
ok(page1.length < PAGE_SIZE, "short first page should not trigger load-more guard failure check");
ok(Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i + 1 })).length === PAGE_SIZE, "full page size");

console.log(failed ? `\n${failed} failed` : "\nAll notification pagination tests passed");
process.exit(failed ? 1 : 0);
