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
  assert(!empty.description, "description is optional");
  assert(Boolean(empty.hours), "requires hours");
  assert(Boolean(empty.icon_key), "requires icon_key");
  assert(
    Boolean(validateAmenityForm({ ...valid, description: "x".repeat(501) }).description),
    "rejects description over 500 characters",
  );
  assert(
    Boolean(validateAmenityForm({ ...valid, name: "x".repeat(101) }).name),
    "rejects name over 100 characters",
  );

  const ok = validateAmenityForm(valid);
  assert(!hasFieldErrors(ok), "accepts valid form");
  assert(!hasFieldErrors(validateAmenityForm({ ...valid, floor: "A".repeat(40) })), "accepts 40-character location");
  assert(
    validateAmenityForm({ ...valid, floor: "B".repeat(41) }).floor === "Keep location under 40 characters.",
    "rejects location over 40 characters",
  );
  assert(
    validateAmenityForm({ ...valid, floor: "A" }).floor === "Use at least 2 characters.",
    "rejects a one-character location",
  );
  assert(
    validateAmenityForm({ ...valid, name: "" }).name === "Amenity Name must contain at least 2 characters.",
    "requires an amenity name of at least 2 characters",
  );
  assert(
    validateAmenityForm({ ...valid, name: "A" }).name === "Amenity Name must contain at least 2 characters.",
    "rejects a one-character amenity name on blur-equivalent validation",
  );
  assert(
    validateAmenityForm({ ...valid, name: "AB" }).name === undefined,
    "accepts a 2-character amenity name",
  );
  assert(
    validateAmenityForm({ ...valid, name: "A".repeat(100) }).name === undefined,
    "accepts a 100-character amenity name",
  );
  assert(
    validateAmenityForm({ ...valid, name: "B".repeat(101) }).name === "Amenity Name must not exceed 100 characters.",
    "rejects an amenity name over 100 characters",
  );
  assert(
    validateAmenityForm({ ...valid, description: "s" }).description ===
      "Description must be at least 10 characters.",
    "rejects a one-character description",
  );
  assert(
    validateAmenityForm({ ...valid, description: "Too short" }).description ===
      "Description must be at least 10 characters.",
    "rejects a description under 10 characters",
  );
  assert(
    validateAmenityForm({ ...valid, description: "1234567890" }).description === undefined,
    "accepts a 10-character description",
  );
  assert(
    validateAmenityForm({ ...valid, description: `  ${"A".repeat(10)}  ` }).description === undefined,
    "trims the description before checking length",
  );
  assert(
    validateAmenityForm({ ...valid, description: "A".repeat(500) }).description === undefined,
    "accepts a 500-character description",
  );
  assert(
    validateAmenityForm({ ...valid, description: "A".repeat(501) }).description ===
      "Description must be 500 characters or fewer.",
    "rejects a description over 500 characters",
  );
  assert(
    amenityFormStepErrors({ ...valid, description: "Short" }, "details").description ===
      "Description must be at least 10 characters.",
    "blocks the details step when the description is too short",
  );
  assert(
    validateAmenityForm({ ...valid, name: "  Pool & Spa  " }).name === undefined,
    "trims and accepts a name with &",
  );
  assert(
    validateAmenityForm({ ...valid, name: "O'Brien Court" }).name === undefined,
    "accepts an apostrophe in the name",
  );
  assert(
    validateAmenityForm({ ...valid, name: "Wi-Fi Lounge" }).name === undefined,
    "accepts a hyphen in the name",
  );
  for (const name of ["Pool?", ",Pool", "Pool--House", "Pool&&Spa", "Pool''s", "?Pool", "././..???", "12345", "---", "???"]) {
    assert(
      validateAmenityForm({ ...valid, name }).name === "Please enter a valid amenity name.",
      `rejects amenity name ${JSON.stringify(name)}`,
    );
    assert(
      amenityFormStepErrors({ ...valid, name }, "details").name === "Please enter a valid amenity name.",
      `details step blocks amenity name ${JSON.stringify(name)}`,
    );
  }
  assert(
    validateAmenityForm({ ...valid, floor: "  Bldg A, #4 / Floor 2.  " }).floor === undefined,
    "trims and accepts a normal location",
  );
  for (const floor of ["Floor?", ", Floor 2", "A//B", "Floor,,2", "Main St#", "??", "????>/..?./.", "123", "---", "..."]) {
    assert(
      validateAmenityForm({ ...valid, floor }).floor === "Please enter a valid location.",
      `rejects location ${JSON.stringify(floor)}`,
    );
    assert(
      amenityFormStepErrors({ ...valid, floor }, "details").floor === "Please enter a valid location.",
      `details step blocks location ${JSON.stringify(floor)}`,
    );
  }

  const payload = amenityFormToPayload(valid);
  assert(payload.name === "Test Pool", "payload maps name");
  assert(payload.hours === "6:00 AM – 10:00 PM", "payload preserves hours");
  assert(payload.start_time === "06:00", "payload includes start_time");
  assert(payload.end_time === "22:00", "payload includes end_time");
  assert(payload.weekends_available === true, "payload includes weekends_available");
  assert(payload.capacity_booking_type === "per_seat", "payload defaults to per-seat capacity booking");
  assert(
    amenityFormToPayload({ ...valid, capacity_booking_type: "full_slot" }).capacity_booking_type === "full_slot",
    "payload stores full-slot capacity booking",
  );
  assert(payload.slot_duration_minutes === 60, "payload includes slot duration");
  assert(
    !hasFieldErrors(validateAmenityForm({ ...valid, slot_duration_minutes: "240" })),
    "accepts custom slot duration (4 hours)",
  );
  assert(
    amenityFormToPayload({ ...valid, slot_duration_minutes: "240" }).slot_duration_minutes === 240,
    "payload stores custom slot duration",
  );
  assert(
    Boolean(validateAmenityForm({ ...valid, slot_duration_minutes: "10" }).slot_duration_minutes),
    "rejects slot duration under 15 minutes",
  );
  assert(
    Boolean(validateAmenityForm({ ...valid, slot_duration_minutes: "500" }).slot_duration_minutes),
    "rejects slot duration over 8 hours",
  );
  assert(payload.shared_billing_enabled === false, "shared billing defaults off");
  assert(payload.shared_billing_amount === null, "shared billing amount is null when off");
  assert(payload.booking_fee === 0, "booking fee defaults to 0");
  assert(Boolean(validateAmenityForm({ ...valid, charge_model: "" }).charge_model), "requires a payment type");
  assert(
    amenityFormToPayload({ ...valid, charge_model: "booking", booking_fee: "10" }).booking_fee === 10,
    "payload stores per-person reservation fee",
  );
  assert(
    !validateAmenityForm({ ...valid, charge_model: "booking", booking_fee: "999999.99" }).booking_fee,
    "accepts booking fee of 999,999.99",
  );
  const overMaxFee = { ...valid, charge_model: "booking" as const, booking_fee: "1000000" };
  assert(
    validateAmenityForm(overMaxFee).booking_fee === "Booking fee must not exceed 999,999.99.",
    "rejects booking fee above 999,999.99",
  );
  const billingStepErrors = amenityFormStepErrors(overMaxFee, "billing", true);
  assert(
    billingStepErrors.booking_fee === "Booking fee must not exceed 999,999.99." && hasFieldErrors(billingStepErrors),
    "billing step blocks a booking fee above 999,999.99",
  );

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
    validateAmenityForm({ ...valid, capacity: "0" }).capacity === "Capacity must be at least 1.",
    "rejects a capacity of 0",
  );
  assert(
    amenityFormStepErrors({ ...valid, capacity: "0" }, "availability").capacity === "Capacity must be at least 1.",
    "availability step blocks a capacity of 0",
  );
  assert(!hasFieldErrors(validateAmenityForm({ ...valid, capacity: "1" })), "accepts a capacity of 1");
  assert(!hasFieldErrors(validateAmenityForm({ ...valid, capacity: "2" })), "accepts a capacity of 2");
  assert(
    validateAmenityForm({ ...valid, status: "closed", capacity: "0" }).capacity === "Capacity must be at least 1.",
    "rejects a closed amenity capacity of 0",
  );
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

  const availabilityWithBillingWizard = amenityFormStepErrors(
    { ...valid, charge_model: "", booking_fee: "" },
    "availability",
    true,
  );
  assert(!availabilityWithBillingWizard.charge_model, "availability step skips payment choice when billing is separate");
  assert(!availabilityWithBillingWizard.booking_fee, "availability step skips booking fee when billing is separate");

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
  assert(
    validateAmenityForm({ ...valid, hours: "4:00 PM - 4:00 PM" }).hours ===
      "Opening and closing times cannot be the same.",
    "rejects identical opening and closing times on the same day",
  );
  assert(
    amenityFormStepErrors({ ...valid, hours: "4:00 PM - 4:00 PM" }, "availability").hours ===
      "Opening and closing times cannot be the same.",
    "availability step blocks identical opening and closing times",
  );
  const nextDayHours = "Sep 29, 2026, 4:00 PM - Sep 30, 2026, 4:00 PM";
  const nextDayForm = {
    ...valid,
    hours: nextDayHours,
    opening_date: "2026-09-29",
    closing_date: "2026-09-30",
  };
  assert(!hasFieldErrors(validateAmenityForm(nextDayForm)), "accepts the same clock time on the next day");
  const nextDayPayload = amenityFormToPayload(nextDayForm);
  assert(nextDayPayload.start_time === "16:00", "next-day payload keeps the opening time");
  assert(nextDayPayload.end_time === "16:00", "next-day payload keeps the closing time");
  assert(nextDayPayload.closes_next_day === true, "next-day payload marks an explicit closing date");
  assert(nextDayPayload.hours === nextDayHours, "next-day payload keeps the dated hours label");
  assert(
    !hasFieldErrors(validateAmenityForm({ ...valid, open_24_hours: true, hours: "Open 24 Hours" })),
    "accepts Open 24 Hours",
  );
  const allDayPayload = amenityFormToPayload({ ...valid, open_24_hours: true, hours: "Open 24 Hours" });
  assert(allDayPayload.hours === "Open 24 Hours", "all-day payload stores Open 24 Hours");
  assert(allDayPayload.start_time === "00:00" && allDayPayload.end_time === "00:00", "all-day payload uses a full-day window");
  assert(allDayPayload.open_24_hours === true, "all-day payload sets the explicit flag");
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
