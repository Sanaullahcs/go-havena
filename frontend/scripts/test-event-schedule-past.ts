/**
 * Run: npx tsx scripts/test-event-schedule-past.ts
 */
import { isEventSchedulePast } from "../src/lib/admin/event-schedule";

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

console.log("\nEvent schedule past (RSVP / Join visibility)");

{
  const tz = "America/New_York";
  // Oct 2, 2026 12:51 PM Eastern — event ends Oct 2 8:00 AM (already ended)
  const noonOct2 = new Date("2026-10-02T16:51:00.000Z");

  const multiDayOngoing = {
    category: "event",
    event_date: "2026-10-01",
    event_end_date: "2026-10-02",
    event_time: "18:20",
    event_time_end: "08:00",
    schedule_timezone: tz,
  };

  // Oct 1 evening — still before end on Oct 2 morning
  const eveningOct1 = new Date("2026-10-02T02:00:00.000Z"); // Oct 1 10 PM ET approx - adjust
  // Use fixed local: Oct 1 2026 8 PM ET = 2026-10-02T00:00:00Z (EDT is UTC-4, so Oct 1 8PM = Oct 2 00:00 UTC)
  const oct1EveningEt = new Date("2026-10-02T00:30:00.000Z");

  assert(
    !isEventSchedulePast(multiDayOngoing, oct1EveningEt),
    "multi-day event not past on start evening (end is next morning)",
  );

  // Oct 2 midday — end was 8 AM same day
  assert(
    isEventSchedulePast(multiDayOngoing, noonOct2),
    "multi-day event past after end time on last day",
  );

  // Bug we fixed: comparing only event_date would mark past on Oct 2 before checking end date
  assert(
    !isEventSchedulePast(
      {
        category: "event",
        event_date: "2026-10-01",
        event_end_date: "2026-10-03",
        event_time: "18:20",
        event_time_end: "08:00",
        schedule_timezone: tz,
      },
      noonOct2,
    ),
    "event with end date Oct 3 still active on Oct 2 afternoon",
  );

  assert(
    !isEventSchedulePast(
      {
        category: "event",
        event_date: "2026-10-02",
        event_time: "18:20",
        event_time_end: "20:00",
        schedule_timezone: tz,
      },
      new Date("2026-10-02T21:00:00.000Z"),
    ),
    "same-day event not past before end time",
  );
}

console.log(failed === 0 ? `\nAll ${passed} tests passed.\n` : `\n${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
