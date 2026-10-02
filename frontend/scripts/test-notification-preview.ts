/**
 * Run: npx tsx scripts/test-notification-preview.ts
 */
import {
  NOTIFICATION_BODY_PREVIEW_MAX,
  notificationPreviewText,
} from "../src/lib/notifications/notification-preview";

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

console.log("\nNotification preview text");
{
  assert(notificationPreviewText("") === "", "empty");
  assert(notificationPreviewText("  Hello  world  ") === "Hello world", "collapses whitespace");
  const short = "a".repeat(100);
  assert(notificationPreviewText(short) === short, "under max unchanged");
  const long = "word ".repeat(80).trim();
  const preview = notificationPreviewText(long);
  assert(preview.endsWith("..."), "long text ends with ellipsis");
  assert(preview.length <= NOTIFICATION_BODY_PREVIEW_MAX + 3, "preview capped near max");
}

console.log(failed === 0 ? `\nAll ${passed} tests passed.\n` : `\n${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
