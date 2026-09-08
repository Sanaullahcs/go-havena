/**
 * Run: npx tsx scripts/test-form-validation.ts
 */
import { emptyPhoneField } from "../src/lib/phone/format";
import { validateInviteMemberForm } from "../src/lib/admin/invite-member-validation";
import { validateNoticeForm } from "../src/lib/admin/notice-form-validation";
import { validatePasswordForm, validateProfileForm } from "../src/lib/admin/profile-validation";
import {
  validateCommunityAdminForm,
  validateResidentForm,
} from "../src/lib/admin/provision-user-validation";
import {
  validateWellnessCategoryForm,
  validateWellnessCourseForm,
  validateWellnessLessonForm,
  validateWellnessCourseEdit,
  validateWellnessLessonEdit,
} from "../src/lib/admin/wellness-form-validation";
import { hasFieldErrors } from "../src/lib/admin/form-validation-utils";
import { getCompleteProfileFieldVisibility } from "../src/lib/admin/complete-profile-fields";
import { validateCompleteProfileForm } from "../src/lib/admin/complete-profile-validation";

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

function assertHasError(errors: Record<string, string | undefined>, field: string, message: string) {
  assert(Boolean(errors[field]), `${message} (field: ${field})`);
}

function assertNoErrors(errors: Record<string, string | undefined>, message: string) {
  assert(!hasFieldErrors(errors), message);
}

console.log("\nInvite member validation");
{
  const emptyPhone = emptyPhoneField();
  const empty = validateInviteMemberForm({ name: "", email: "", unit: "" }, emptyPhone);
  assertHasError(empty, "name", "requires name");
  assertHasError(empty, "email", "requires email");
  assertHasError(empty, "phone", "requires phone");

  const badEmail = validateInviteMemberForm(
    { name: "Jane Doe", email: "not-an-email", unit: "" },
    emptyPhone,
  );
  assertHasError(badEmail, "email", "rejects invalid email");

  const longUnit = validateInviteMemberForm(
    { name: "Jane Doe", email: "jane@example.com", unit: "x".repeat(51) },
    { country: "US", digits: "4155552671", e164: "+14155552671", valid: true },
  );
  assertHasError(longUnit, "unit", "rejects long unit");

  const ok = validateInviteMemberForm(
    { name: "Jane Doe", email: "jane@example.com", unit: "12B" },
    { country: "US", digits: "4155552671", e164: "+14155552671", valid: true },
  );
  assertNoErrors(ok, "accepts valid invite");
}

console.log("\nNotice form validation");
{
  const empty = validateNoticeForm(
    { title: "", body: "", category: "general", location: "", event_date: "", event_time: "", event_time_end: "" },
    { kind: "notice" },
  );
  assertHasError(empty, "title", "requires title");
  assertHasError(empty, "body", "requires body");

  const short = validateNoticeForm(
    { title: "Hi", body: "Too short", category: "general", location: "", event_date: "", event_time: "", event_time_end: "" },
    { kind: "notice" },
  );
  assertHasError(short, "title", "title min length");
  assertHasError(short, "body", "body min length");

  const eventPublish = validateNoticeForm(
    {
      title: "Community BBQ",
      body: "Join us in the courtyard for food and fun.",
      category: "event",
      location: "",
      event_date: "",
      event_time: "",
      event_time_end: "",
    },
    { kind: "event", publishNow: true },
  );
  assertHasError(eventPublish, "event_date", "event publish requires date");
  assertHasError(eventPublish, "event_time", "event publish requires start");
  assertHasError(eventPublish, "event_time_end", "event publish requires end");
  assertHasError(eventPublish, "location", "event publish requires location");

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
  assertHasError(noticePublish, "event_date", "notice publish requires date");
  assertHasError(noticePublish, "event_time", "notice publish requires start");
  assertHasError(noticePublish, "event_time_end", "notice publish requires end");

  const alertPublish = validateNoticeForm(
    {
      title: "Power outage",
      body: "Scheduled maintenance tonight in block A.",
      category: "emergency",
      location: "",
      event_date: "",
      event_time: "",
      event_time_end: "",
    },
    { kind: "alert", publishNow: true },
  );
  assertHasError(alertPublish, "event_date", "alert publish requires date");

  const alertReadyWithoutTimes = validateNoticeForm(
    {
      title: "Power outage",
      body: "Scheduled maintenance tonight in block A.",
      category: "emergency",
      location: "",
      event_date: "2026-07-20",
      event_time: "",
      event_time_end: "",
      event_capacity: "",
    },
    { kind: "alert", publishNow: true },
  );
  assertNoErrors(alertReadyWithoutTimes, "alert publish without times");

  const alertBadTimes = validateNoticeForm(
    {
      title: "Power outage",
      body: "Scheduled maintenance tonight in block A.",
      category: "emergency",
      location: "",
      event_date: "2026-07-15",
      event_time: "18:00",
      event_time_end: "17:00",
    },
    { kind: "alert" },
  );
  assertHasError(alertBadTimes, "event_time_end", "alert end after start");

  const badTimes = validateNoticeForm(
    {
      title: "Community meeting",
      body: "Monthly residents meeting in the hall.",
      category: "event",
      location: "",
      event_date: "2026-07-15",
      event_time: "18:00",
      event_time_end: "17:00",
    },
    { kind: "event" },
  );
  assertHasError(badTimes, "event_time_end", "end time after start");

  const ok = validateNoticeForm(
    {
      title: "Pool maintenance",
      body: "The pool will be closed for cleaning this weekend.",
      category: "maintenance",
      location: "Pool area",
      event_date: "2026-07-12",
      event_time: "09:00",
      event_time_end: "17:00",
      event_capacity: "",
    },
    { kind: "notice" },
  );
  assertNoErrors(ok, "accepts valid notice");

  const noticeReady = validateNoticeForm(
    {
      title: "Pool maintenance",
      body: "The pool will be closed for cleaning this weekend.",
      category: "maintenance",
      location: "",
      event_date: "2026-07-20",
      event_time: "09:00",
      event_time_end: "10:00",
      event_capacity: "",
    },
    { kind: "notice", publishNow: true },
  );
  assertNoErrors(noticeReady, "notice publish ready");

  const eventReady = validateNoticeForm(
    {
      title: "Community BBQ",
      body: "Join us in the courtyard for food and fun.",
      category: "event",
      location: "Courtyard",
      event_date: "2026-07-20",
      event_time: "17:00",
      event_time_end: "20:00",
      event_capacity: "50",
    },
    { kind: "event", publishNow: true },
  );
  assertNoErrors(eventReady, "event publish ready");

  const alertReady = validateNoticeForm(
    {
      title: "Power outage",
      body: "Scheduled maintenance tonight in block A.",
      category: "emergency",
      location: "",
      event_date: "2026-07-20",
      event_time: "22:00",
      event_time_end: "23:30",
      event_capacity: "",
    },
    { kind: "alert", publishNow: true },
  );
  assertNoErrors(alertReady, "alert publish ready");

  const scheduleMissing = validateNoticeForm(
    {
      title: "Future notice",
      body: "This notice will publish tomorrow morning.",
      category: "general",
      location: "",
      event_date: "2026-07-21",
      event_time: "09:00",
      event_time_end: "10:00",
      event_capacity: "",
      schedule_later: true,
      scheduled_at_date: "",
      scheduled_at_time: "",
    },
    { kind: "notice", publishNow: true },
  );
  assertHasError(scheduleMissing, "scheduled_at_date", "schedule later requires publish date");
  assertHasError(scheduleMissing, "scheduled_at_time", "schedule later requires publish time");

  const scheduleReady = validateNoticeForm(
    {
      title: "Future notice",
      body: "This notice will publish tomorrow morning.",
      category: "general",
      location: "",
      event_date: "2026-07-21",
      event_time: "09:00",
      event_time_end: "10:00",
      event_capacity: "",
      schedule_later: true,
      scheduled_at_date: "2026-07-20",
      scheduled_at_time: "08:00",
    },
    { kind: "notice", publishNow: true },
  );
  assertNoErrors(scheduleReady, "schedule later ready");

  const eventScheduleReady = validateNoticeForm(
    {
      title: "Future BBQ",
      body: "Join us in the courtyard for food and fun.",
      category: "event",
      location: "Courtyard",
      event_date: "2026-07-25",
      event_time: "17:00",
      event_time_end: "20:00",
      event_capacity: "",
      schedule_later: true,
      scheduled_at_date: "2026-07-20",
      scheduled_at_time: "09:00",
    },
    { kind: "event", publishNow: true },
  );
  assertNoErrors(eventScheduleReady, "event schedule later ready");

  const alertScheduleReady = validateNoticeForm(
    {
      title: "Future alert",
      body: "Water shutoff will be announced tomorrow.",
      category: "emergency",
      location: "",
      event_date: "2026-07-22",
      event_time: "08:00",
      event_time_end: "12:00",
      event_capacity: "",
      schedule_later: true,
      scheduled_at_date: "2026-07-21",
      scheduled_at_time: "07:00",
    },
    { kind: "alert", publishNow: true },
  );
  assertNoErrors(alertScheduleReady, "alert schedule later ready");
}

console.log("\nProfile validation");
{
  const emptyName = validateProfileForm("", emptyPhoneField(), "");
  assertHasError(emptyName, "name", "requires name");

  const longBio = validateProfileForm("Admin User", emptyPhoneField(), "x".repeat(501));
  assertHasError(longBio, "bio", "rejects long bio");

  const ok = validateProfileForm("Admin User", emptyPhoneField(), "Community admin.");
  assertNoErrors(ok, "accepts valid profile without phone");
}

console.log("\nPassword validation");
{
  const empty = validatePasswordForm("", "", "");
  assertHasError(empty, "current", "requires current");
  assertHasError(empty, "next", "requires new");
  assertHasError(empty, "confirm", "requires confirm");

  const short = validatePasswordForm("oldpass", "abc", "abc");
  assertHasError(short, "next", "min length");

  const mismatch = validatePasswordForm("oldpass", "newpassword", "different");
  assertHasError(mismatch, "confirm", "match check");

  const ok = validatePasswordForm("oldpass", "newpassword", "newpassword");
  assertNoErrors(ok, "accepts valid password change");
}

console.log("\nProvision user validation");
{
  const invalidAdmin = validateCommunityAdminForm(
    {
      name: "",
      email: "bad",
      phone: "",
      region_id: "",
      community_mode: "new",
      community_id: "",
      community_name: "",
      community_address: "",
      community_description: "",
    },
    emptyPhoneField(),
  );
  assertHasError(invalidAdmin, "email", "admin email");
  assertHasError(invalidAdmin, "phone", "admin phone");
  assertHasError(invalidAdmin, "region_id", "admin region");
  assertHasError(invalidAdmin, "community_name", "admin community name");
  assertHasError(invalidAdmin, "community_address", "admin community address");

  const missingCommunity = validateCommunityAdminForm(
    {
      name: "Jane Admin",
      email: "jane@example.com",
      phone: "",
      region_id: 1,
      community_mode: "",
      community_id: "",
      community_name: "",
      community_address: "",
      community_description: "",
    },
    { country: "US", digits: "4155552671", e164: "+14155552671", valid: true },
  );
  assertHasError(missingCommunity, "community_id", "admin must pick community or add new");

  const okExistingCommunity = validateCommunityAdminForm(
    {
      name: "Jane Admin",
      email: "jane@example.com",
      phone: "",
      region_id: 1,
      community_mode: "existing",
      community_id: 12,
      community_name: "",
      community_address: "",
      community_description: "",
    },
    { country: "US", digits: "4155552671", e164: "+14155552671", valid: true },
  );
  assertNoErrors(okExistingCommunity, "accepts existing unassigned community");

  const invalidResident = validateResidentForm(
    { name: "A", email: "", phone: "", region_id: "", community_id: "" },
    emptyPhoneField(),
  );
  assertHasError(invalidResident, "name", "resident name min");
  assertHasError(invalidResident, "phone", "resident phone");
  assertHasError(invalidResident, "community_id", "resident community");

  const okAdmin = validateCommunityAdminForm(
    {
      name: "Jane Admin",
      email: "jane@example.com",
      phone: "",
      region_id: 1,
      community_mode: "new",
      community_id: "",
      community_name: "Sunset Heights",
      community_address: "123 Main St",
      community_description: "A friendly community.",
    },
    { country: "US", digits: "4155552671", e164: "+14155552671", valid: true },
  );
  assertNoErrors(okAdmin, "accepts valid admin provision (phone pre-validated)");
}

console.log("\nWellness form validation");
{
  const badCategory = validateWellnessCategoryForm({ title: "", color: "blue" });
  assertHasError(badCategory, "title", "category requires title");
  assertHasError(badCategory, "color", "category rejects invalid color");

  const okCategory = validateWellnessCategoryForm({ title: "Mindfulness", color: "#1B4F8A" });
  assertNoErrors(okCategory, "accepts valid category");

  const badCourse = validateWellnessCourseForm({ title: "", description: "", category_id: null });
  assertHasError(badCourse, "category_id", "course requires category");
  assertHasError(badCourse, "title", "course requires title");
  assertHasError(badCourse, "description", "course requires description");

  const okCourse = validateWellnessCourseForm({
    title: "Morning Yoga",
    description: "Gentle flow for all levels.",
    category_id: 1,
  });
  assertNoErrors(okCourse, "accepts valid course");

  const badLesson = validateWellnessLessonForm({
    title: "",
    course_id: null,
    link_url: "not-a-url",
  });
  assertHasError(badLesson, "course_id", "lesson requires course");
  assertHasError(badLesson, "title", "lesson requires title");
  assertHasError(badLesson, "link_url", "lesson rejects invalid link");
  assertHasError(badLesson, "content", "lesson requires file or link");

  const okLessonLink = validateWellnessLessonForm({
    title: "Breathing Basics",
    course_id: 1,
    link_url: "https://example.com/lesson.mp4",
  });
  assertNoErrors(okLessonLink, "accepts lesson with link");

  const okLessonFile = validateWellnessLessonForm({
    title: "Breathing Basics",
    course_id: 1,
    hasFile: true,
  });
  assertNoErrors(okLessonFile, "accepts lesson with file");

  const okCourseEdit = validateWellnessCourseEdit({
    title: "Updated Course",
    description: "Updated description.",
  });
  assertNoErrors(okCourseEdit, "accepts valid course edit");

  const okLessonEdit = validateWellnessLessonEdit({
    title: "Updated Lesson",
    keepExistingFile: true,
  });
  assertNoErrors(okLessonEdit, "accepts lesson edit keeping existing file");
}

console.log("\nComplete profile field visibility (mobile parity)");
{
  const systemCreatedAdmin = getCompleteProfileFieldVisibility({
    user: {
      role: "community_admin",
      community_admin_status: "approved",
      memberships: [{ role: "admin", status: "approved" }],
    },
    role: "admin",
  });
  assert(systemCreatedAdmin.showResidenceType, "system-created CA shows residence type");
  assert(!systemCreatedAdmin.showUtilityBill, "system-created CA hides utility bill");
  assert(!systemCreatedAdmin.showFamilyNumberField, "system-created CA hides family number");
  assert(systemCreatedAdmin.unitRequired, "system-created CA requires unit");
  assert(systemCreatedAdmin.skipUtilityBill, "system-created CA skips utility bill");

  const selfServeAdmin = getCompleteProfileFieldVisibility({
    user: {
      role: "community_admin",
      community_admin_status: "pending",
      memberships: [{ role: "admin", status: "pending" }],
    },
    role: "admin",
  });
  assert(selfServeAdmin.showResidenceType, "self-serve CA shows residence type");
  assert(selfServeAdmin.showUtilityBill, "self-serve CA shows utility bill");
  assert(!selfServeAdmin.showFamilyNumberField, "self-serve CA hides family number");
  assert(!selfServeAdmin.skipUtilityBill, "self-serve CA does not skip utility bill");

  const invitedAdmin = getCompleteProfileFieldVisibility({
    user: {
      role: "community_admin",
      community_admin_status: "pending",
      memberships: [{ role: "admin", status: "pending", invite_code_used: "INVITE-1" }],
    },
    role: "admin",
  });
  assert(!invitedAdmin.showUtilityBill, "invited CA hides utility bill");
  assert(invitedAdmin.showResidenceType, "invited CA still shows residence type");
  assert(!invitedAdmin.showFamilyNumberField, "invited CA hides family number");

  const invitedQuery = getCompleteProfileFieldVisibility({
    user: {
      role: "community_admin",
      community_admin_status: "pending",
    },
    role: "admin",
    invited: true,
  });
  assert(!invitedQuery.showUtilityBill, "invited=1 query hides utility bill");

  const residentJoin = getCompleteProfileFieldVisibility({
    user: { role: "resident", memberships: [{ role: "resident", status: "pending" }] },
    role: "resident",
  });
  assert(residentJoin.showFamilyNumberField, "resident join shows family number");
  assert(residentJoin.showResidenceType, "resident join shows residence type");
  assert(residentJoin.showUtilityBill, "resident join shows utility bill");

  const approvedResident = getCompleteProfileFieldVisibility({
    user: { role: "resident", memberships: [{ role: "resident", status: "approved" }] },
    role: "resident",
  });
  assert(!approvedResident.showUtilityBill, "admin-created resident hides utility bill");
  assert(approvedResident.showFamilyNumberField, "admin-created resident still shows family");

  const guest = getCompleteProfileFieldVisibility({
    user: { role: "guest", memberships: [{ role: "guest", status: "approved" }] },
    role: "guest",
  });
  assert(!guest.showFamilyNumberField, "guest hides family number");
  assert(!guest.showResidenceType, "guest hides residence type");
  assert(!guest.showUtilityBill, "guest hides utility bill");
  assert(!guest.unitRequired, "guest unit is optional");
}

console.log("\nComplete profile form validation");
{
  const missingPhone = validateCompleteProfileForm({
    name: "Jane Doe",
    email: "jane@example.com",
    phoneDigits: "",
    phoneCountry: "US",
    bio: "",
    unitNumber: "101",
    residenceType: "homeowner",
    utilityFile: null,
    requireUtilityFile: false,
    requireResidenceType: true,
  });
  assertHasError(missingPhone, "phone", "requires phone");

  const systemCreatedOk = validateCompleteProfileForm({
    name: "Jane Doe",
    email: "jane@example.com",
    phoneDigits: "4155552671",
    phoneCountry: "US",
    bio: "",
    unitNumber: "Admin Office",
    residenceType: "homeowner",
    utilityFile: null,
    requireUtilityFile: false,
    requireResidenceType: true,
  });
  assertNoErrors(systemCreatedOk, "accepts system-created CA without utility bill");

  const selfServeNeedsBill = validateCompleteProfileForm({
    name: "Jane Doe",
    email: "jane@example.com",
    phoneDigits: "4155552671",
    phoneCountry: "US",
    bio: "",
    unitNumber: "101",
    residenceType: "homeowner",
    utilityFile: null,
    requireUtilityFile: true,
    requireResidenceType: true,
  });
  assertHasError(selfServeNeedsBill, "utilityFile", "self-serve CA requires utility bill");

  const guestOk = validateCompleteProfileForm({
    name: "Guest User",
    email: "guest@example.com",
    phoneDigits: "4155552671",
    phoneCountry: "US",
    bio: "",
    unitNumber: "",
    residenceType: "",
    utilityFile: null,
    requireUtilityFile: false,
    requireResidenceType: false,
    guestMode: true,
  });
  assertNoErrors(guestOk, "guest can skip unit, residence, and utility bill");
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
