/**
 * Run: npx tsx scripts/test-amenity-web-validation.ts
 */
import {
  amenityFormStepErrors,
  amenityFormToPayload,
  validateAmenityForm,
  visibleAmenityFormSteps,
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
  custom_category: "",
  charge_model: "free",
  shared_billing_enabled: false,
  shared_billing_frequency: "monthly",
  shared_billing_amount: "",
  shared_billing_due_day: "",
  booking_fee: "0",
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
    custom_category: "",
    charge_model: "free",
    shared_billing_enabled: false,
    shared_billing_frequency: "monthly",
    shared_billing_amount: "",
    shared_billing_due_day: "",
    booking_fee: "",
  });
  assert(Boolean(empty.name), "requires name");
  assert(Boolean(empty.hours), "requires hours");
  assert(Boolean(empty.icon_key), "requires icon_key");

  const ok = validateAmenityForm(valid);
  assert(!hasFieldErrors(ok), "accepts valid form");
  assert(!hasFieldErrors(validateAmenityForm({ ...valid, floor: "A".repeat(40) })), "accepts 40-character location");
  assert(Boolean(validateAmenityForm({ ...valid, floor: "B".repeat(41) }).floor), "rejects location over 40 characters");

  const payload = amenityFormToPayload(valid);
  assert(payload.name === "Test Pool", "payload maps name");
  assert(payload.hours === "6:00 AM – 10:00 PM", "payload preserves hours");
  assert(payload.start_time === "06:00", "payload includes start_time");
  assert(payload.end_time === "22:00", "payload includes end_time");
  assert(payload.weekends_available === true, "payload includes weekends_available");
  assert(payload.slot_duration_minutes === 60, "payload includes slot duration");
  assert(payload.shared_billing_enabled === false, "shared billing defaults off");
  assert(payload.shared_billing_amount === null, "shared billing amount is null when off");
  assert(payload.booking_fee === 0, "booking fee defaults to 0");
  assert(!hasFieldErrors(validateAmenityForm({ ...valid, booking_fee: "25" })), "accepts booking fee");
  assert(amenityFormToPayload({ ...valid, booking_fee: "25" }).booking_fee === 25, "payload stores booking fee");

  const billingOn = validateAmenityForm({
    ...valid,
    shared_billing_enabled: true,
    shared_billing_amount: "",
    shared_billing_due_day: "",
  });
  assert(Boolean(billingOn.shared_billing_amount), "requires amount when shared billing is on");
  assert(Boolean(billingOn.shared_billing_due_day), "requires due day when shared billing is on");

  const billingOk = validateAmenityForm({
    ...valid,
    shared_billing_enabled: true,
    shared_billing_amount: "25",
    shared_billing_due_day: "10",
  });
  assert(!hasFieldErrors(billingOk), "accepts shared billing configuration");
  const billingPayload = amenityFormToPayload({
    ...valid,
    shared_billing_enabled: true,
    shared_billing_amount: "25",
    shared_billing_due_day: "10",
  });
  assert(billingPayload.shared_billing_enabled === true, "payload enables shared billing");
  assert(billingPayload.shared_billing_type === "all_residents", "payload stores all-residents type");
  assert(billingPayload.shared_billing_frequency === "monthly", "payload stores monthly frequency");
  assert(billingPayload.shared_billing_amount === 25, "payload stores amount");
  assert(billingPayload.shared_billing_due_day === 10, "payload stores due day");

  assert(Boolean(validateAmenityForm({ ...valid, capacity: "" }).capacity), "requires capacity for slots");
  assert(
    !hasFieldErrors(validateAmenityForm({ ...valid, status: "open", capacity: "" })),
    "open allows empty capacity",
  );
  assert(
    !hasFieldErrors(
      validateAmenityForm({
        ...valid,
        status: "open",
        capacity: "",
        charge_model: "booking",
        booking_fee: "25",
      }),
    ),
    "open accepts a booking fee like slots",
  );
  assert(
    amenityFormToPayload({
      ...valid,
      status: "open",
      capacity: "",
      charge_model: "booking",
      booking_fee: "25",
    }).booking_fee === 25,
    "open payload stores booking fee",
  );
  assert(
    Boolean(
      validateAmenityForm({
        ...valid,
        status: "closed",
        capacity: "",
        charge_model: "booking",
        booking_fee: "25",
      }).booking_fee,
    ),
    "closed rejects a booking fee",
  );
  assert(
    !hasFieldErrors(validateAmenityForm({ ...valid, status: "closed", capacity: "" })),
    "closed allows empty capacity",
  );
  assert(amenityFormToPayload(valid).capacity === 20, "slots payload includes capacity");
  assert(
    amenityFormToPayload({ ...valid, status: "open", capacity: "" }).capacity === null,
    "open empty capacity payload is null",
  );
  assert(
    amenityFormToPayload({ ...valid, status: "closed", capacity: "" }).capacity === null,
    "closed empty capacity payload is null",
  );

  const emptyDetails = amenityFormStepErrors(
    { ...valid, name: "", floor: "", capacity: "", icon_key: "" },
    "details",
  );
  assert(Boolean(emptyDetails.name), "step 1 validates name");
  assert(Boolean(emptyDetails.floor), "step 1 validates location");
  assert(!emptyDetails.capacity, "step 1 does not require capacity");
  assert(!emptyDetails.hours, "step 1 does not require hours");

  const emptyHours = amenityFormStepErrors({ ...valid, hours: "", capacity: "" }, "availability");
  assert(Boolean(emptyHours.hours), "step 2 validates hours");
  assert(Boolean(emptyHours.capacity), "step 2 requires capacity for slots");
  assert(!emptyHours.name, "step 2 does not re-validate name");

  assert(
    visibleAmenityFormSteps(true, false).join(",") === "details,availability,billing,review",
    "always includes billing step when the form supports amenity billing",
  );
  assert(
    visibleAmenityFormSteps(true, true).join(",") === "details,availability,billing,review",
    "keeps billing step when shared billing is on",
  );
  assert(
    visibleAmenityFormSteps(false, true).join(",") === "details,availability,review",
    "hides billing step when the form does not support shared billing",
  );
}

console.log("\nWeb hours range utils");
{
  const parsed = parseHoursRange("6:00 AM – 10:00 PM");
  assert(parsed.open === "06:00", "parse open to 24h");
  assert(parsed.close === "22:00", "parse close to 24h");

  const formatted = formatHoursRange("09:00", "17:00");
  assert(formatted.includes("9:00 AM"), "format open AM");
  assert(formatted.includes("5:00 PM"), "format close PM");

  const noonToMidnight = parseHoursRange("12:00 PM - 12:00 AM");
  assert(noonToMidnight.open === "12:00", "parse noon opening");
  assert(noonToMidnight.close === "00:00", "parse midnight closing as 00:00");
  assert(!hasFieldErrors(validateAmenityForm({ ...valid, hours: "12:00 PM - 12:00 AM" })), "accepts noon to midnight");
  assert(amenityFormToPayload({ ...valid, hours: "12:00 PM - 12:00 AM" }).end_time === "00:00", "payload stores midnight as 00:00");

  const eveningToMidnight = parseHoursRange("8:00 PM - 12:00 AM");
  assert(eveningToMidnight.open === "20:00", "parse 8 PM opening");
  assert(eveningToMidnight.close === "00:00", "parse 8 PM to midnight close");

  const overnight = parseHoursRange("10:00 PM - 2:00 AM");
  assert(overnight.open === "22:00", "parse 10 PM opening");
  assert(overnight.close === "02:00", "parse 2 AM closing as next-day clock time");
  assert(!hasFieldErrors(validateAmenityForm({ ...valid, hours: "10:00 PM - 2:00 AM" })), "accepts overnight hours");
  assert(amenityFormToPayload({ ...valid, hours: "10:00 PM - 2:00 AM" }).start_time === "22:00", "overnight payload start");
  assert(amenityFormToPayload({ ...valid, hours: "10:00 PM - 2:00 AM" }).end_time === "02:00", "overnight payload end");

  const morning = parseHoursRange("12:00 AM - 4:00 AM");
  assert(morning.open === "00:00", "parse same-day midnight opening");
  assert(morning.close === "04:00", "parse 4 AM same-day close");
  assert(!hasFieldErrors(validateAmenityForm({ ...valid, hours: "12:00 AM - 4:00 AM" })), "accepts midnight to 4 AM");
}

console.log("");
if (failed > 0) {
  console.error(`FAILED: ${failed}, passed ${passed}`);
  process.exit(1);
}
console.log(`All ${passed} web amenity validation tests passed.`);
