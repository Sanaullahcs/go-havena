/**
 * Run: node scripts/test-guest-utils.mjs
 * Validates guest invite normalization and access schedule helpers.
 */
import { normalizeInviteCode } from "../utils/guest-invite.js";
import {
  addHours,
  buildAccessWindowFromDuration,
  dateOnly,
  mergeDateAndTime,
  roundToNextHour,
  toApiScheduleDateTime,
} from "../utils/form-datetime.js";

// Pure helpers mirrored from guest-access-schedule.js (avoid RN/service imports in Node).
function isGuestAccessExpiredError(error) {
  return error?.code === "GUEST_ACCESS_EXPIRED";
}

function isGuestAccessRevokedError(error) {
  return error?.code === "GUEST_ACCESS_REVOKED";
}

function isGuestAccessNotStartedError(error) {
  return error?.code === "ACCESS_NOT_STARTED";
}

function isGuestAccessScheduleError(error) {
  return isGuestAccessExpiredError(error) || isGuestAccessNotStartedError(error);
}

function isGuestAccessTerminationError(error) {
  return (
    isGuestAccessExpiredError(error) ||
    isGuestAccessRevokedError(error) ||
    error?.code === "GUEST_ACCESS_REJECTED"
  );
}

function isGuestAccessTerminatedStatus(status) {
  return status === "revoked" || status === "rejected" || status === "expired";
}

function isGuestAccessWindowActive(guestAccess) {
  if (!guestAccess?.starts_at || !guestAccess?.ends_at) {
    return guestAccess?.access_window_active === true;
  }

  const now = Date.now();
  const startsAt = new Date(guestAccess.starts_at).getTime();
  const endsAt = new Date(guestAccess.ends_at).getTime();

  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) {
    return guestAccess?.access_window_active === true;
  }

  return now >= startsAt && now <= endsAt;
}

function guestAccessNoticeMessage(code) {
  if (code === "GUEST_ACCESS_EXPIRED") return "Your guest access has expired.";
  if (code === "GUEST_ACCESS_REVOKED" || code === "GUEST_ACCESS_REJECTED") {
    return "Your guest access has been revoked.";
  }
  if (code === "ACCESS_NOT_STARTED") {
    return "Your guest access has not started yet. Please try again at the scheduled time.";
  }
  return null;
}

function msUntil(isoDate) {
  if (!isoDate) return null;
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) return null;
  return target - Date.now();
}

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

console.log("\n=== Guest invite normalization ===");
assert("compact code", normalizeInviteCode("GST3QAC3612") === "GST-3QAC-3612");
assert("spaced code", normalizeInviteCode("GST - 3QAC - 3612") === "GST-3QAC-3612");
assert("lowercase", normalizeInviteCode("gst-3qac-3612") === "GST-3QAC-3612");
assert("trimmed", normalizeInviteCode("  GST-3QAC-3612  ") === "GST-3QAC-3612");
assert("invalid passthrough", normalizeInviteCode("INVALID") === "INVALID");

console.log("\n=== Guest access error detection ===");
assert("expired", isGuestAccessExpiredError({ code: "GUEST_ACCESS_EXPIRED" }));
assert("revoked", isGuestAccessRevokedError({ code: "GUEST_ACCESS_REVOKED" }));
assert("not started", isGuestAccessNotStartedError({ code: "ACCESS_NOT_STARTED" }));
assert("schedule error", isGuestAccessScheduleError({ code: "ACCESS_NOT_STARTED" }));
assert("termination error", isGuestAccessTerminationError({ code: "GUEST_ACCESS_REVOKED" }));
assert("rejected termination", isGuestAccessTerminationError({ code: "GUEST_ACCESS_REJECTED" }));

console.log("\n=== Guest access status ===");
assert("revoked status", isGuestAccessTerminatedStatus("revoked"));
assert("rejected status", isGuestAccessTerminatedStatus("rejected"));
assert("expired status", isGuestAccessTerminatedStatus("expired"));
assert("active not terminated", !isGuestAccessTerminatedStatus("active"));

console.log("\n=== Guest access window ===");
const now = Date.now();
const past = new Date(now - 3600000).toISOString();
const future = new Date(now + 3600000).toISOString();
assert(
  "window active",
  isGuestAccessWindowActive({ starts_at: past, ends_at: future }),
);
assert(
  "window not started",
  !isGuestAccessWindowActive({ starts_at: future, ends_at: new Date(now + 7200000).toISOString() }),
);
assert(
  "window ended",
  !isGuestAccessWindowActive({ starts_at: new Date(now - 7200000).toISOString(), ends_at: past }),
);

console.log("\n=== Guest notice messages ===");
assert("expired notice", guestAccessNoticeMessage("GUEST_ACCESS_EXPIRED")?.includes("expired"));
assert("revoked notice", guestAccessNoticeMessage("GUEST_ACCESS_REVOKED")?.includes("revoked"));
assert("not started notice", guestAccessNoticeMessage("ACCESS_NOT_STARTED")?.includes("not started"));
assert("unknown notice", guestAccessNoticeMessage("OTHER") === null);

console.log("\n=== msUntil ===");
assert("future ms positive", msUntil(future) > 0);
assert("past ms negative", msUntil(past) < 0);
assert("invalid date null", msUntil("not-a-date") === null);

console.log("\n=== Guest invite schedule helpers ===");
const atThreeFifteen = new Date(2026, 6, 18, 15, 15, 30, 0);
const roundedFour = roundToNextHour(atThreeFifteen);
assert("roundToNextHour clears seconds", roundedFour.getMinutes() === 0 && roundedFour.getSeconds() === 0);
assert("roundToNextHour advances partial hour", roundedFour.getHours() === 16);

const onTheHour = new Date(2026, 6, 18, 15, 0, 0, 0);
assert("roundToNextHour keeps whole hour", roundToNextHour(onTheHour).getHours() === 15);

const midnight = dateOnly(atThreeFifteen);
assert("dateOnly uses midnight", midnight.getHours() === 0 && midnight.getMinutes() === 0);
assert("dateOnly keeps calendar day", midnight.getDate() === atThreeFifteen.getDate());

const merged = mergeDateAndTime(dateOnly(atThreeFifteen), atThreeFifteen);
assert("mergeDateAndTime combines date and time", merged.getHours() === 15 && merged.getMinutes() === 15);

const oneHourWindow = buildAccessWindowFromDuration(onTheHour, 1);
assert("1 hour window end hour", oneHourWindow.endTime.getHours() === 16);
assert(
  "1 hour window end after start",
  oneHourWindow.endTime.getTime() - oneHourWindow.startTime.getTime() === 60 * 60 * 1000,
);
assert(
  "1 hour window api payload valid",
  Boolean(toApiScheduleDateTime(oneHourWindow.startDate, oneHourWindow.startTime)) &&
    Boolean(toApiScheduleDateTime(oneHourWindow.endDate, oneHourWindow.endTime)),
);

const sixHourEnd = addHours(onTheHour, 6);
assert("addHours adds six hours", sixHourEnd.getHours() === 21);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
