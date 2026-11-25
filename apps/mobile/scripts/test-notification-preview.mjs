import { flattenNotificationText, previewNotificationText } from "../utils/notification-preview.js";

let failed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
    return;
  }
  console.log("  ✓", msg);
}

console.log("\nNotification preview");

ok(
  flattenNotificationText("  Your bill\n\nis due\ttoday  ") === "Your bill is due today",
  "collapses newlines and extra spaces",
);

const short = "New notice posted.";
ok(previewNotificationText(short, { width: 280, fontSize: 12, lines: 3 }) === short, "keeps short text");
ok(previewNotificationText("   ", { width: 280, fontSize: 12 }) === "", "drops blank text");
ok(previewNotificationText("Full text", { width: 0, fontSize: 12 }) === "Full text", "waits for a measured width");

const long =
  "Your monthly bill payment is due today. Please complete your payment before the office closes so the community account stays current and no late fee is added to your unit. Bring a copy of the invoice, confirm the unit number, and ask the front desk to mark the payment received before the evening cutoff.";
const narrow = previewNotificationText(long, { width: 180, fontSize: 12, lines: 3 });
const wide = previewNotificationText(long, { width: 340, fontSize: 12, lines: 3 });
const fits = previewNotificationText("Your monthly bill payment is due today.", { width: 340, fontSize: 12, lines: 3 });

ok(narrow.endsWith("..."), "narrow preview ends with ...");
ok(!narrow.endsWith("......"), "does not double the ellipsis");
ok(narrow.length < long.length, "narrow preview is shorter than the original");
ok(wide.endsWith("..."), "wide preview still truncates a very long notice");
ok(wide.length > narrow.length, "wider screens keep a longer preview");
ok(fits === "Your monthly bill payment is due today.", "short text on a wide screen is not cut");
ok(!narrow.includes("\n"), "preview stays on one paragraph");

console.log(failed ? `\n${failed} failed` : "\nAll notification preview tests passed");
process.exit(failed ? 1 : 0);
