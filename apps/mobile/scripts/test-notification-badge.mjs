function evenPx(value) {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function getBadgeMetrics(label, isCompact) {
  const height = evenPx(isCompact ? 16 : 18);
  const hPad = isCompact ? 3.5 : 4;
  const charStep = isCompact ? 6 : 6.5;
  const len = label.length;

  if (len === 1) {
    return { width: height, height, isCircle: true };
  }

  const textWidth = charStep * len;
  const width = evenPx(Math.max(height, textWidth + hPad * 2));
  return { width, height, isCircle: false };
}

let failed = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
    return;
  }
  console.log("  ✓", msg);
}

console.log("\nNotification badge metrics");

const single = getBadgeMetrics("3", true);
ok(single.isCircle, "single digit is circle");
ok(single.width === single.height, "circle width equals height");

const double = getBadgeMetrics("18", true);
ok(!double.isCircle, "18 uses pill");
ok(double.width > double.height, "18 pill wider than tall");
ok(double.width <= double.height + 14, "18 pill stays compact");

const capped = getBadgeMetrics("99+", true);
ok(capped.width > capped.height, "99+ pill wider than tall");
ok(capped.width < capped.height * 2.2, "99+ pill not excessively wide");

console.log(failed ? `\n${failed} failed` : "\nAll badge metric tests passed");
process.exit(failed ? 1 : 0);
