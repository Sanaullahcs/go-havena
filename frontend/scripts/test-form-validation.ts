/**
 * Run: npx tsx scripts/test-form-validation.ts
 */
import { emptyPhoneField } from "../src/lib/phone/format";
import {
  INVITE_MEMBER_NAME_RULE_MESSAGE,
  INVITE_MEMBER_UNIT_RULE_MESSAGE,
  inviteMemberNameLiveError,
  inviteMemberUnitLiveError,
  validateInviteMemberForm,
} from "../src/lib/admin/invite-member-validation";
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
import {
  GUEST_EMAIL_FORMAT_MESSAGE,
  GUEST_NAME_FORMAT_MESSAGE,
  GUEST_DURATION_MIN_MESSAGE,
  GUEST_START_PAST_MESSAGE,
  canSubmitGuestInvite,
  guestDurationFieldError,
  guestEmailFieldError,
  guestNameFieldError,
  guestPermissionsFieldError,
  guestStartFieldError,
} from "../src/lib/admin/guest-invite-validation";
import {
  GUEST_PERMISSION_REQUIRED_MESSAGE,
  INITIAL_GUEST_INVITE_PERMISSIONS,
  applyGuestPermissionToggle,
} from "../src/lib/guest-permissions";
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
  assertHasError(empty, "unit", "requires unit");

  const badEmail = validateInviteMemberForm(
    { name: "Jane Doe", email: "not-an-email", unit: "12B" },
    emptyPhone,
  );
  assertHasError(badEmail, "email", "rejects invalid email");

  const longUnit = validateInviteMemberForm(
    { name: "Jane Doe", email: "jane@example.com", unit: "x".repeat(21) },
    { country: "US", digits: "4155552671", e164: "+14155552671", valid: true },
  );
  assertHasError(longUnit, "unit", "rejects long unit");
  assert(longUnit.unit === INVITE_MEMBER_UNIT_RULE_MESSAGE, "unit length uses rule message");

  const badName = validateInviteMemberForm(
    { name: "Jane2", email: "jane@example.com", unit: "B-12" },
    { country: "US", digits: "4155552671", e164: "+14155552671", valid: true },
  );
  assert(badName.name === INVITE_MEMBER_NAME_RULE_MESSAGE, "rejects numbers in name");

  const badUnitChars = validateInviteMemberForm(
    { name: "Jane Doe", email: "jane@example.com", unit: "B21+[" },
    { country: "US", digits: "4155552671", e164: "+14155552671", valid: true },
  );
  assert(badUnitChars.unit === INVITE_MEMBER_UNIT_RULE_MESSAGE, "rejects unsupported unit characters");

  assert(inviteMemberNameLiveError("") === null, "empty name has no live format error");
  assert(inviteMemberNameLiveError("Jane2") === INVITE_MEMBER_NAME_RULE_MESSAGE, "live name error while typing");
  assert(inviteMemberNameLiveError("Jane Doe") === null, "clears name error when valid");
  assert(inviteMemberUnitLiveError("") === null, "empty unit has no live format error");
  assert(inviteMemberUnitLiveError("B21+[") === INVITE_MEMBER_UNIT_RULE_MESSAGE, "rejects + and [ immediately");
  assert(inviteMemberUnitLiveError("B@12") === INVITE_MEMBER_UNIT_RULE_MESSAGE, "rejects @");
  assert(inviteMemberUnitLiveError("B#12") === INVITE_MEMBER_UNIT_RULE_MESSAGE, "rejects #");
  assert(inviteMemberUnitLiveError("B-12") === null, "clears unit error when valid");
  assert(inviteMemberUnitLiveError("12B/3") === null, "allows slash");

  const ok = validateInviteMemberForm(
    { name: "Jane Doe", email: "jane@example.com", unit: "12B" },
    { country: "US", digits: "4155552671", e164: "+14155552671", valid: true },
  );
  assertNoErrors(ok, "accepts valid invite");
}

console.log("\nGuest invite validation");
{
  assert(guestNameFieldError("") === null, "empty name has no live format error");
  assert(guestNameFieldError("Alex Johnson") === null, "accepts letters and spaces");
  assert(guestNameFieldError("J. R. Ewing") === null, "accepts full stops");
  assert(guestNameFieldError("Alex2") === GUEST_NAME_FORMAT_MESSAGE, "rejects numbers in name");
  assert(guestNameFieldError("Alex@") === GUEST_NAME_FORMAT_MESSAGE, "rejects special characters in name");
  assert(guestEmailFieldError("") === null, "empty email has no live format error");
  assert(guestEmailFieldError("guest@email.com") === null, "accepts valid email");
  assert(guestEmailFieldError("not-an-email") === GUEST_EMAIL_FORMAT_MESSAGE, "rejects invalid email");

  const window = { starts_at: "2026-09-11T10:00", ends_at: "2026-09-12T10:00" };
  const now = new Date("2026-09-11T10:00");
  const emptyPhone = emptyPhoneField();
  assert(
    !canSubmitGuestInvite({ guest_name: "", guest_email: "a@b.com", ...window }, emptyPhone, now),
    "button blocked when name empty",
  );
  assert(
    !canSubmitGuestInvite({ guest_name: "Alex2", guest_email: "a@b.com", ...window }, emptyPhone, now),
    "button blocked when name invalid",
  );
  assert(
    !canSubmitGuestInvite({ guest_name: "Alex", guest_email: "bad", ...window }, emptyPhone, now),
    "button blocked when email invalid",
  );
  assert(
    canSubmitGuestInvite({ guest_name: "Alex Johnson", guest_email: "guest@email.com", ...window }, emptyPhone, now),
    "button enabled when required fields are valid",
  );
  assert(INITIAL_GUEST_INVITE_PERMISSIONS.wellness === true, "wellness is selected by default");
  assert(
    guestPermissionsFieldError({
      feed: false,
      notices: false,
      events: false,
      marketplace: false,
      businesses: false,
      wellness: false,
    }) === GUEST_PERMISSION_REQUIRED_MESSAGE,
    "requires at least one permission",
  );
  assert(
    guestPermissionsFieldError(INITIAL_GUEST_INVITE_PERMISSIONS) === null,
    "default wellness permission is valid",
  );
  const blocked = applyGuestPermissionToggle(INITIAL_GUEST_INVITE_PERMISSIONS, "wellness", false);
  assert(blocked.permissions.wellness === true, "cannot uncheck the last permission");
  assert(blocked.error === GUEST_PERMISSION_REQUIRED_MESSAGE, "shows permission required message");
  const added = applyGuestPermissionToggle(INITIAL_GUEST_INVITE_PERMISSIONS, "feed", true);
  assert(added.permissions.feed === true && added.error === null, "can select additional permissions");
  const removedWellness = applyGuestPermissionToggle(added.permissions, "wellness", false);
  assert(removedWellness.permissions.wellness === false && removedWellness.permissions.feed === true, "can deselect wellness when another remains");
  assert(
    !canSubmitGuestInvite({
      guest_name: "Alex Johnson",
      guest_email: "guest@email.com",
      ...window,
      permissions: {
        feed: false,
        notices: false,
        events: false,
        marketplace: false,
        businesses: false,
        wellness: false,
      },
    }, emptyPhone, now),
    "button blocked when no permission is selected",
  );
  assert(
    guestDurationFieldError("2026-09-11T10:00", "2026-09-11T10:01") === GUEST_DURATION_MIN_MESSAGE,
    "rejects a 1-minute access window",
  );
  assert(
    guestDurationFieldError("2026-09-11T10:00", "2026-09-11T10:29") === GUEST_DURATION_MIN_MESSAGE,
    "rejects a 29-minute access window",
  );
  assert(
    guestDurationFieldError("2026-09-11T10:00", "2026-09-11T10:30") === null,
    "accepts a 30-minute access window",
  );
  assert(
    guestDurationFieldError("2026-09-11T10:00", "2026-09-11T09:30") === GUEST_DURATION_MIN_MESSAGE,
    "rejects an end time before start time",
  );
  assert(
    !canSubmitGuestInvite({
      guest_name: "Alex Johnson",
      guest_email: "guest@email.com",
      starts_at: "2026-09-11T10:00",
      ends_at: "2026-09-11T10:10",
    }, emptyPhone, now),
    "button blocked when duration is under 30 minutes",
  );
  assert(
    guestStartFieldError("2026-09-11T09:59", now) === GUEST_START_PAST_MESSAGE,
    "rejects a start one minute in the past",
  );
  assert(
    guestStartFieldError("2025-09-11T10:00", now) === GUEST_START_PAST_MESSAGE,
    "rejects a start from a previous year",
  );
  assert(
    guestStartFieldError("2026-09-11T10:00", now) === null,
    "accepts a start at the current minute",
  );
  assert(
    guestStartFieldError("2026-09-11T10:01", now) === null,
    "accepts a start in the future",
  );
  assert(
    !canSubmitGuestInvite({
      guest_name: "Alex Johnson",
      guest_email: "guest@email.com",
      starts_at: "2026-09-10T10:00",
      ends_at: "2026-09-11T10:00",
    }, emptyPhone, now),
    "button blocked when start is in the past",
  );
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
  assert(systemCreatedAdmin.showUtilityBill, "system-created CA shows utility bill");
  assert(!systemCreatedAdmin.showFamilyNumberField, "system-created CA hides family number");
  assert(systemCreatedAdmin.unitRequired, "system-created CA requires unit");
  assert(!systemCreatedAdmin.skipUtilityBill, "system-created CA does not skip utility bill");

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
  assert(invitedAdmin.showUtilityBill, "invited CA shows utility bill");
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
  assert(invitedQuery.showUtilityBill, "invited=1 query still shows utility bill");

  const residentJoin = getCompleteProfileFieldVisibility({
    user: { role: "resident", memberships: [{ role: "resident", status: "pending" }] },
    role: "resident",
  });
  assert(residentJoin.showFamilyNumberField, "resident join shows family number");
  assert(residentJoin.showResidenceType, "resident join shows residence type");
  assert(residentJoin.showUtilityBill, "resident join shows utility bill");

  const invitedResident = getCompleteProfileFieldVisibility({
    user: {
      role: "resident",
      memberships: [{ role: "resident", status: "approved", invite_code_used: "ABC123" }],
    },
    role: "resident",
    invited: true,
  });
  assert(invitedResident.showUtilityBill, "invited resident shows utility bill");
  assert(!invitedResident.skipUtilityBill, "invited resident does not skip utility bill");

  const approvedResident = getCompleteProfileFieldVisibility({
    user: { role: "resident", memberships: [{ role: "resident", status: "approved" }] },
    role: "resident",
  });
  assert(approvedResident.showUtilityBill, "admin-created resident shows utility bill");
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
