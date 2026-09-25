/**
 * Run: node apps/mobile/scripts/test-form-validation.mjs
 * (from repo root) or: npm run test:validation (from apps/mobile)
 */
import {
  hasFieldErrors,
  validateNoticeForm,
  validateCompleteProfileForm,
  validateFeedPostForm,
  validateFeedCommentForm,
  validateBusinessForm,
  validateListingForm,
  validateDealForm,
  validateDealMenuItem,
  validateCommunityRequestForm,
  validateInviteCodeForm,
  validateInviteMemberForm,
  validateCommunityRuleForm,
  validateDocumentForm,
  validateGuestInviteForm,
} from "../utils/form-validation.js";

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

function assertHasError(errors, field, message) {
  assert(Boolean(errors[field]), `${message} (${field})`);
}

function assertNoErrors(errors, message) {
  assert(!hasFieldErrors(errors), message);
}

console.log("\nNotice / event / alert validation");
{
  const empty = validateNoticeForm(
    { title: "", body: "", category: "", location: "", event_date: "", event_time: "", event_time_end: "" },
    { kind: "notice" },
  );
  assertHasError(empty, "title", "requires title");
  assertHasError(empty, "body", "requires body");
  assertHasError(empty, "category", "requires category");

  const short = validateNoticeForm(
    { title: "Hi", body: "short", category: "general", location: "", event_date: "", event_time: "", event_time_end: "" },
    { kind: "notice" },
  );
  assertHasError(short, "title", "title min");
  assertHasError(short, "body", "body min");

  const event = validateNoticeForm(
    {
      title: "Block Party",
      body: "Join us for food and music in the courtyard.",
      location: "Courtyard",
      event_date: "",
      event_time: "",
      event_time_end: "",
    },
    { kind: "event", publishNow: true, requireLocation: true },
  );
  assertHasError(event, "event_date", "event date required");
  assertHasError(event, "event_time", "event start required");
  assertHasError(event, "event_time_end", "event end required");

  const noticePublish = validateNoticeForm(
    {
      title: "Pool maintenance",
      body: "The pool will be closed for cleaning this weekend.",
      category: "maintenance",
      location: "",
      event_date: "",
      event_time: "",
      event_time_end: "",
    },
    { kind: "notice", publishNow: true },
  );
  assertHasError(noticePublish, "event_date", "notice date required");
  assertHasError(noticePublish, "event_time", "notice start required");
  assertHasError(noticePublish, "event_time_end", "notice end required");

  const alertPublish = validateNoticeForm(
    {
      title: "Power outage",
      body: "Scheduled maintenance tonight in block A.",
      location: "",
      event_date: "",
      event_time: "",
      event_time_end: "",
    },
    { kind: "alert", publishNow: true },
  );
  assertHasError(alertPublish, "event_date", "alert date required");

  const alertReadyWithoutTimes = validateNoticeForm(
    {
      title: "Power outage",
      body: "Scheduled maintenance tonight in block A.",
      location: "",
      event_date: "2026-07-20",
      event_time: "",
      event_time_end: "",
    },
    { kind: "alert", publishNow: true },
  );
  assertNoErrors(alertReadyWithoutTimes, "alert publish without times");

  const times = validateNoticeForm(
    {
      title: "Meeting",
      body: "Monthly residents meeting in the hall.",
      location: "",
      event_date: "2026-07-15",
      event_time: "18:00",
      event_time_end: "17:00",
    },
    { kind: "event" },
  );
  assertHasError(times, "event_time_end", "end after start");

  const ok = validateNoticeForm(
    {
      title: "Pool hours",
      body: "The pool closes at 8 PM this weekend.",
      category: "general",
      location: "",
      event_date: "",
      event_time: "",
      event_time_end: "",
    },
    { kind: "notice" },
  );
  assertNoErrors(ok, "valid notice");

  const noticeReady = validateNoticeForm(
    {
      title: "Pool hours",
      body: "The pool closes at 8 PM this weekend.",
      category: "general",
      location: "",
      event_date: "2026-07-20",
      event_time: "09:00",
      event_time_end: "10:00",
    },
    { kind: "notice", publishNow: true },
  );
  assertNoErrors(noticeReady, "notice publish ready enables button");

  const eventReady = validateNoticeForm(
    {
      title: "Block Party",
      body: "Join us for food and music in the courtyard.",
      location: "Courtyard",
      event_date: "2026-07-20",
      event_time: "17:00",
      event_time_end: "20:00",
    },
    { kind: "event", publishNow: true, requireLocation: true },
  );
  assertNoErrors(eventReady, "event publish ready enables button");

  const alertReady = validateNoticeForm(
    {
      title: "Power outage",
      body: "Scheduled maintenance tonight in block A.",
      location: "",
      event_date: "2026-07-20",
      event_time: "22:00",
      event_time_end: "23:30",
    },
    { kind: "alert", publishNow: true },
  );
  assertNoErrors(alertReady, "alert publish ready enables button");

  const sameTime = validateNoticeForm(
    {
      title: "Meeting",
      body: "Monthly residents meeting in the hall.",
      location: "Hall",
      event_date: "2026-07-20",
      event_time: "18:00",
      event_time_end: "18:00",
    },
    { kind: "event", publishNow: true, requireLocation: true },
  );
  assertHasError(sameTime, "event_time_end", "same start/end disables button");

  const scheduleMissing = validateNoticeForm(
    {
      title: "Future event",
      body: "This event will publish tomorrow morning.",
      location: "Hall",
      event_date: "2026-07-25",
      event_time: "17:00",
      event_time_end: "20:00",
      scheduled_date: "",
      scheduled_time: "",
    },
    { kind: "event", publishNow: true, requireLocation: true, requirePublishSchedule: true },
  );
  assertHasError(scheduleMissing, "scheduled_date", "schedule later requires publish date");
  assertHasError(scheduleMissing, "scheduled_time", "schedule later requires publish time");

  const scheduleReady = validateNoticeForm(
    {
      title: "Future event",
      body: "This event will publish tomorrow morning.",
      location: "Hall",
      event_date: "2026-07-25",
      event_time: "17:00",
      event_time_end: "20:00",
      scheduled_date: "2026-07-20",
      scheduled_time: "09:00",
    },
    { kind: "event", publishNow: true, requireLocation: true, requirePublishSchedule: true },
  );
  assertNoErrors(scheduleReady, "event schedule later ready");

  const noticeScheduleReady = validateNoticeForm(
    {
      title: "Future notice",
      body: "This notice will publish tomorrow morning.",
      category: "general",
      location: "",
      event_date: "2026-07-21",
      event_time: "09:00",
      event_time_end: "10:00",
      scheduled_date: "2026-07-20",
      scheduled_time: "08:00",
    },
    { kind: "notice", publishNow: true, requirePublishSchedule: true },
  );
  assertNoErrors(noticeScheduleReady, "notice schedule later ready");

  const alertScheduleReady = validateNoticeForm(
    {
      title: "Future alert",
      body: "Water shutoff will be announced tomorrow.",
      location: "",
      event_date: "2026-07-22",
      event_time: "08:00",
      event_time_end: "12:00",
      scheduled_date: "2026-07-21",
      scheduled_time: "07:00",
    },
    { kind: "alert", publishNow: true, requirePublishSchedule: true },
  );
  assertNoErrors(alertScheduleReady, "alert schedule later ready");
}

console.log("\nComplete profile validation");
{
  const empty = validateCompleteProfileForm({
    name: "",
    email: "",
    phoneDigits: "",
    unitNumber: "",
    residenceType: "",
    utilityFile: null,
  });
  assertHasError(empty, "name", "name required");
  assertHasError(empty, "email", "email required");
  assertHasError(empty, "phone", "phone required");
  assertHasError(empty, "utilityFile", "bill required");

  const ok = validateCompleteProfileForm({
    name: "Jane Doe",
    email: "jane@example.com",
    phoneDigits: "5551234567",
    phoneCountry: "US",
    unitNumber: "12B",
    residenceType: "tenant",
    utilityFile: { uri: "file://bill.pdf" },
  });
  assertNoErrors(ok, "valid profile");

  const adminMissingOffice = validateCompleteProfileForm({
    name: "Jane Doe",
    email: "jane@example.com",
    phoneDigits: "5551234567",
    phoneCountry: "US",
    unitNumber: "",
    residenceType: "",
    officeAddress: "",
    utilityFile: { uri: "file://bill.pdf" },
    communityAdmin: true,
    requireResidenceType: false,
  });
  assertHasError(adminMissingOffice, "officeAddress", "community admin office required");
  assert(!adminMissingOffice.unitNumber, "community admin does not require unit");
  assert(!adminMissingOffice.residenceType, "community admin does not require residence");

  const adminOk = validateCompleteProfileForm({
    name: "Jane Doe",
    email: "jane@example.com",
    phoneDigits: "5551234567",
    phoneCountry: "US",
    unitNumber: "",
    residenceType: "",
    officeAddress: "100 Management Office",
    utilityFile: { uri: "file://bill.pdf" },
    communityAdmin: true,
    requireResidenceType: false,
  });
  assertNoErrors(adminOk, "valid community admin profile");
}

console.log("\nFeed post & comment validation");
{
  assertHasError(validateFeedPostForm({ body: "", hasImage: false }), "body", "empty post");
  assertHasError(validateFeedPostForm({ body: "x".repeat(2001), hasImage: false }), "body", "post max");
  assertNoErrors(validateFeedPostForm({ body: "Hello neighbors!", hasImage: false }), "valid post");
  assertHasError(validateFeedCommentForm(""), "body", "empty comment");
}

console.log("\nBusiness validation");
{
  const errs = validateBusinessForm(
    { business: "", category: "", address: "", hours: "", description: "" },
    { phoneDigits: "", isValidPhoneFn: () => false },
  );
  assertHasError(errs, "business", "business name");
  assertHasError(errs, "phone", "phone");
}

console.log("\nListing validation");
{
  const errs = validateListingForm(
    { title: "", description: "", price: "", category: "", condition: "", location: "", photos: [] },
    { listingType: "item" },
  );
  assertHasError(errs, "title", "title");
  assertHasError(errs, "condition", "condition");
}

console.log("\nCommunity request validation");
{
  assertHasError(
    validateCommunityRequestForm({ communityName: "A", address: "1234", regionId: null }),
    "regionId",
    "region",
  );
  assertNoErrors(
    validateCommunityRequestForm({
      communityName: "Oak Valley",
      address: "123 Main Street",
      regionId: 1,
    }),
    "valid request",
  );
}

console.log("\nInvite code validation");
{
  assertHasError(validateInviteCodeForm(""), "inviteCode", "empty code");
  assertHasError(validateInviteCodeForm("ABC"), "inviteCode", "short code");
  assertNoErrors(validateInviteCodeForm("MAPLE-2024-XYZ"), "valid invite code");
}

console.log("\nInvite member validation");
{
  assertHasError(
    validateInviteMemberForm({ name: "", email: "bad", unit: "", phoneDigits: "", phoneCountry: "US" }),
    "email",
    "bad email",
  );
  assertHasError(
    validateInviteMemberForm({ name: "Jane Doe", email: "jane@example.com", unit: "12B", phoneDigits: "", phoneCountry: "US" }),
    "phone",
    "phone required",
  );
  assertNoErrors(
    validateInviteMemberForm({
      name: "Jane Doe",
      email: "jane@example.com",
      unit: "12B",
      phoneDigits: "4155552671",
      phoneCountry: "US",
    }),
    "valid invite",
  );
}

console.log("\nCommunity rule validation");
{
  assertNoErrors(
    validateCommunityRuleForm({
      title: "Quiet Hours",
      category: "Noise & Quiet Hours",
      description: "No loud music after 10 PM.",
      severity: "standard",
    }),
    "valid rule",
  );
  assertHasError(
    validateCommunityRuleForm({
      title: "",
      category: "",
      description: "",
      severity: "invalid",
    }),
    "severity",
    "invalid severity",
  );
}

console.log("\nDocument validation");
{
  assertHasError(
    validateDocumentForm({ title: "", category: "" }, { hasFile: false }),
    "file",
    "file required",
  );
  assertNoErrors(
    validateDocumentForm(
      { title: "Bylaws", category: "Legal" },
      { hasFile: true },
    ),
    "valid document",
  );
  assertHasError(
    validateDocumentForm({ title: "Bylaws", category: "" }, { hasFile: true }),
    "category",
    "other category required when empty",
  );
}

console.log("\nDeal validation");
{
  const empty = validateDealForm(
    {
      dealTitle: "",
      discountLabel: "",
      category: "",
      description: "",
      hasBusiness: true,
      hasImage: false,
    },
    { businessStatus: "approved" },
  );
  assertHasError(empty, "dealTitle", "deal title");
  assertHasError(empty, "discountLabel", "discount label");
  assertHasError(empty, "category", "category");
  assertHasError(empty, "description", "description");
  assertHasError(empty, "image", "deal image");

  const ok = validateDealForm(
    {
      dealTitle: "Summer Sale",
      discountLabel: "20% OFF",
      category: "Retail",
      description: "Save on selected items this weekend only.",
      hasBusiness: true,
      hasImage: true,
    },
    { businessStatus: "approved" },
  );
  assertNoErrors(ok, "valid deal");
}

console.log("\nDeal menu item validation");
{
  const empty = validateDealMenuItem({ name: "", description: "", price: "" });
  assertHasError(empty, "name", "menu item name required");

  const tooLong = validateDealMenuItem({
    name: "A".repeat(121),
    description: "B".repeat(501),
    price: "C".repeat(41),
  });
  assertHasError(tooLong, "name", "menu item name max");
  assertHasError(tooLong, "description", "menu item description max");
  assertHasError(tooLong, "price", "menu item price max");

  assertNoErrors(
    validateDealMenuItem({ name: "Avocado Toast", description: "Sourdough", price: "$8.50" }),
    "valid menu item",
  );
}

console.log("\nGuest invite validation");
{
  const base = {
    guest_name: "Alex Johnson",
    guest_email: "guest@email.com",
    phone_digits: "",
    starts_at: "2026-09-11T10:00:00",
    ends_at: "2026-09-12T10:00:00",
    permissions: { wellness: true },
  };
  assertNoErrors(validateGuestInviteForm(base), "accepts a valid window within 1 year");
  assertNoErrors(
    validateGuestInviteForm({ ...base, ends_at: "2027-09-11T10:00:00" }),
    "accepts an end date exactly 1 year from start",
  );
  const tooLong = validateGuestInviteForm({ ...base, ends_at: "2027-09-11T10:01:00" });
  assert(
    tooLong.ends_at === "Guest access cannot exceed 1 year from the start date.",
    "rejects an end more than 1 year from start",
  );
  const beforeStart = validateGuestInviteForm({ ...base, ends_at: "2026-09-11T09:00:00" });
  assert(Boolean(beforeStart.ends_at), "rejects an end date before start date");
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
