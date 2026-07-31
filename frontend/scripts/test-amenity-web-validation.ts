/**
 * Run: npx tsx scripts/test-amenity-web-validation.ts
 */
import {
  validateAmenityForm,
  amenityFormToPayload,
  type AmenityForm,
} from "../src/lib/admin/amenity-form-validation";
import { hasFieldErrors } from "../src/lib/admin/form-validation-utils";
import {
  formatHoursRange,
  parseHoursRange,
} from "../src/lib/admin/hours-range-utils";

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

const valid: AmenityForm = {
  name: "Test Pool",
  description: "Heated pool",
  status: "bookable",
  capacity: "20",
  floor: "Ground level",
  hours: "6:00 AM – 10:00 PM",
  weekends_available: true,
  slot_duration_minutes: "60",
  icon_key: "pool",
};

console.log("\nWeb amenity form validation");
{
  const empty = validateAmenityForm({
    name: "",
    description: "",
    status: "bookable",
    capacity: "",
    floor: "",
    hours: "",
    weekends_available: true,
    slot_duration_minutes: "",
    icon_key: "",
  });
  assert(Boolean(empty.name), "requires name");
  assert(Boolean(empty.hours), "requires hours");
  assert(Boolean(empty.icon_key), "requires icon_key");

  const ok = validateAmenityForm(valid);
  assert(!hasFieldErrors(ok), "accepts valid form");

  const payload = amenityFormToPayload(valid);
  assert(payload.name === "Test Pool", "payload maps name");
  assert(payload.hours === "6:00 AM – 10:00 PM", "payload preserves hours");
  assert(payload.start_time === "06:00", "payload includes start_time");
  assert(payload.end_time === "22:00", "payload includes end_time");
  assert(payload.weekends_available === true, "payload includes weekends_available");
  assert(payload.slot_duration_minutes === 60, "payload includes slot duration");
}

console.log("\nWeb hours range utils");
{
  const parsed = parseHoursRange("6:00 AM – 10:00 PM");
  assert(parsed.open === "06:00", "parse open to 24h");
  assert(parsed.close === "22:00", "parse close to 24h");

  const formatted = formatHoursRange("09:00", "17:00");
  assert(formatted.includes("9:00 AM"), "format open AM");
  assert(formatted.includes("5:00 PM"), "format close PM");
}

console.log("");
if (failed > 0) {
  console.error(`FAILED: ${failed}, passed ${passed}`);
  process.exit(1);
}
console.log(`All ${passed} web amenity validation tests passed.`);
