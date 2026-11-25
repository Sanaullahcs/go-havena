/**
 * Run: node apps/mobile/scripts/test-slot-duration.mjs
 */
const AMENITY_SLOT_MIN_MINUTES = 15;
const AMENITY_SLOT_MAX_MINUTES = 480;
const PRESET = [30, 60, 90, 120];

function isPresetSlotDurationMinutes(minutes) {
  return PRESET.includes(Number(minutes));
}

function splitSlotDurationMinutes(totalMinutes) {
  const total = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

function combineSlotDurationMinutes(hoursRaw, minutesRaw) {
  const hours = Math.max(0, Math.floor(Number(hoursRaw) || 0));
  const minutes = Math.max(0, Math.min(59, Math.floor(Number(minutesRaw) || 0)));
  return hours * 60 + minutes;
}

function isValidAmenitySlotDurationMinutes(minutes) {
  const n = Number(minutes);
  return Number.isInteger(n) && n >= AMENITY_SLOT_MIN_MINUTES && n <= AMENITY_SLOT_MAX_MINUTES;
}

/** Mirrors SlotDurationPicker display logic */
function pickerDisplays(total) {
  const { hours, minutes: mins } = splitSlotDurationMinutes(total);
  const hoursDisplay = total === 0 ? "" : hours > 0 ? String(hours) : "";
  const minutesDisplay = total === 0 ? "" : mins > 0 ? String(mins) : "";
  return { hoursDisplay, minutesDisplay };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

console.log("\nMobile slot duration helpers");

assert(isPresetSlotDurationMinutes(60), "60 is preset");
assert(!isPresetSlotDurationMinutes(180), "180 is custom");
assert(splitSlotDurationMinutes(180).hours === 3, "180 splits to 3 hours");
assert(splitSlotDurationMinutes(180).minutes === 0, "180 splits to 0 minutes");
assert(combineSlotDurationMinutes(3, 0) === 180, "3h + 0m = 180");
assert(combineSlotDurationMinutes("3", "") === 180, "3h + empty minutes = 180");
assert(combineSlotDurationMinutes("", "45") === 45, "empty hours + 45m = 45");
assert(isValidAmenitySlotDurationMinutes(240), "4 hours valid");
assert(!isValidAmenitySlotDurationMinutes(10), "10 minutes invalid");
assert(!isValidAmenitySlotDurationMinutes(500), "500 minutes invalid");

const threeHours = pickerDisplays(180);
assert(threeHours.hoursDisplay === "3", "picker shows 3 in hours for 180m");
assert(threeHours.minutesDisplay === "", "picker minutes empty (not undefined) for 180m");
assert(!String(threeHours.minutesDisplay).includes("undefined"), "minutes never shows undefined");

console.log(failed === 0 ? `\nAll ${passed} mobile slot duration tests passed.\n` : `\n${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
