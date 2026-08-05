/**
 * Mobile form validation — aligned with frontend dashboard validators
 * (frontend/src/lib/admin/*-validation.ts) and backend Laravel rules.
 */

import { getPhoneValidationError } from "./phone";
import { normalizeGuestPermissions } from "../constants/guest-permissions";

export const LIMITS = {
  noticeTitle: 200,
  noticeBody: 5000,
  noticeBodyMin: 10,
  noticeTitleMin: 3,
  location: 255,
  profileName: 50,
  profileUnit: 50,
  profileEmail: 255,
  profileBio: 500,
  feedPost: 2000,
  feedComment: 1000,
  businessName: 200,
  businessCategory: 60,
  businessDescription: 2000,
  listingLocation: 160,
  businessAddress: 255,
  businessPhone: 40,
  businessHours: 120,
  listingTitle: 200,
  listingCategory: 60,
  dealTitle: 200,
  dealDiscount: 60,
  dealCategory: 60,
  dealDescription: 2000,
  communityName: 150,
  communityAddress: 255,
  inviteCode: 64,
  inviteUnit: 50,
  ruleTitle: 200,
  ruleCategory: 100,
  documentTitle: 200,
  documentCategory: 100,
  utilityBillMaxBytes: 10 * 1024 * 1024,
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PLACEHOLDER_EMAIL_SUFFIX = "@phone.havena.local";

export function isPlaceholderEmail(email) {
  const value = String(email ?? "").trim().toLowerCase();
  return !value || value.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

export function formatDisplayEmail(email) {
  if (isPlaceholderEmail(email)) return null;
  return String(email ?? "").trim();
}

export function validateUserEmail(email) {
  const value = String(email ?? "").trim();
  if (!value) return "Email address is required.";
  if (value.length > LIMITS.profileEmail) {
    return `Email must be ${LIMITS.profileEmail} characters or less.`;
  }
  if (!EMAIL_RE.test(value)) return "Enter a valid email address.";
  if (isPlaceholderEmail(value)) return "Enter a personal email address.";
  return null;
}

export function hasFieldErrors(errors) {
  return Object.values(errors).some(Boolean);
}

function requiredText(value, label, { min, max } = {}) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return `${label} is required.`;
  if (min != null && trimmed.length < min) {
    return `${label} must be at least ${min} characters.`;
  }
  if (max != null && trimmed.length > max) {
    return `${label} must be ${max} characters or less.`;
  }
  return null;
}

/** @param {string} timeStr HH:mm */
function parseTimeMinutes(timeStr) {
  const trimmed = String(timeStr ?? "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

/** @param {string} dateStr YYYY-MM-DD */
/** @param {string} timeStr HH:mm */
export function compareTimes(timeStart, timeEnd) {
  if (!timeStart?.trim() || !timeEnd?.trim()) return 0;
  const startMin = parseTimeMinutes(timeStart);
  const endMin = parseTimeMinutes(timeEnd);
  if (startMin == null || endMin == null) {
    return timeStart.trim().localeCompare(timeEnd.trim());
  }
  return startMin - endMin;
}

/**
 * @param {{ title: string, body: string, location?: string, event_date?: string, event_time?: string, event_time_end?: string }} form
 * @param {{ kind?: 'notice'|'event'|'alert', publishNow?: boolean, requireSchedule?: boolean, requireLocation?: boolean }} opts
 */
export function validateNoticeForm(form, opts = {}) {
  const errors = {};
  const kind = opts.kind ?? "notice";

  const titleErr = requiredText(form.title, "Title", {
    min: LIMITS.noticeTitleMin,
    max: LIMITS.noticeTitle,
  });
  if (titleErr) errors.title = titleErr;

  const bodyErr = requiredText(form.body, "Description", {
    min: LIMITS.noticeBodyMin,
    max: LIMITS.noticeBody,
  });
  if (bodyErr) errors.body = bodyErr;

  const location = String(form.location ?? "").trim();
  if (location.length > LIMITS.location) {
    errors.location = `Location must be ${LIMITS.location} characters or less.`;
  }
  if (opts.requireLocation && !location) {
    errors.location = "Location is required.";
  }

  if (kind === "notice") {
    const allowed = new Set(["general", "maintenance", "security", "finance"]);
    const category = String(form.category ?? "").trim();
    if (!category || !allowed.has(category)) {
      errors.category = "Category is required.";
    }
  }

  if (opts.requireSchedule) {
    if (!String(form.event_date ?? "").trim()) {
      errors.event_date = "Date is required when scheduling.";
    }
    if (kind !== "alert") {
      if (!String(form.event_time ?? "").trim()) {
        errors.event_time = "Start time is required when scheduling.";
      }
      if (!String(form.event_time_end ?? "").trim()) {
        errors.event_time_end = "End time is required when scheduling.";
      }
    }
  }

  if (opts.requirePublishSchedule) {
    if (!String(form.scheduled_date ?? "").trim()) {
      errors.scheduled_date = "Publish date is required when scheduling.";
    }
    if (!String(form.scheduled_time ?? "").trim()) {
      errors.scheduled_time = "Publish time is required when scheduling.";
    }
  }

  const scheduleKinds = ["notice", "event", "alert"];
  if (opts.publishNow && scheduleKinds.includes(kind)) {
    const dateLabel =
      kind === "event" ? "Event date" : kind === "alert" ? "Alert date" : "Notice date";
    if (!String(form.event_date ?? "").trim()) {
      errors.event_date = `${dateLabel} is required.`;
    }
    if (kind !== "alert") {
      if (!String(form.event_time ?? "").trim()) {
        errors.event_time = "Start time is required.";
      }
      if (!String(form.event_time_end ?? "").trim()) {
        errors.event_time_end = "End time is required.";
      }
    }
  }

  if (form.event_time?.trim() && form.event_time_end?.trim()) {
    const startMin = parseTimeMinutes(form.event_time);
    const endMin = parseTimeMinutes(form.event_time_end);
    if (startMin != null && endMin != null && startMin >= endMin) {
      errors.event_time_end = "End time must be after start time.";
    }
  }

  // Prevent publishing a same-day event/notice that already ended.
  if (
    (kind === "event" || kind === "notice") &&
    String(form.event_date ?? "").trim() &&
    String(form.event_time_end ?? "").trim()
  ) {
    const day = String(form.event_date).trim().slice(0, 10);
    const endMin = parseTimeMinutes(form.event_time_end);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (day === today && endMin != null) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (endMin <= nowMin) {
        errors.event_time_end = "End time must be later than now for today's date.";
      }
    }
  }

  if (kind === "notice" && form.audience_type === "selected" && (form.recipient_user_ids?.length ?? 0) === 0) {
    errors.recipient_user_ids = "Select at least one resident.";
  }

  return errors;
}

/** Default end time to 1 hour after start (keeps publish button enableable). */
export function defaultEndTimeFromStart(startDate) {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return null;
  return new Date(startDate.getTime() + 60 * 60 * 1000);
}

export function validateCompleteProfileForm({
  name,
  email,
  bio,
  unitNumber,
  residenceType,
  utilityFile,
  requireUtilityFile = true,
  guestMode = false,
}) {
  const errors = {};

  const nameErr = requiredText(name, "Full name", { min: 2, max: LIMITS.profileName });
  if (nameErr) errors.name = nameErr;

  const emailErr = validateUserEmail(email);
  if (emailErr) errors.email = emailErr;

  const bioText = String(bio ?? "").trim();
  if (bioText.length > LIMITS.profileBio) {
    errors.bio = `Bio must be ${LIMITS.profileBio} characters or less.`;
  }

  if (guestMode) {
    const unitText = String(unitNumber ?? "").trim();
    if (unitText.length > LIMITS.profileUnit) {
      errors.unitNumber = `Unit number must be ${LIMITS.profileUnit} characters or less.`;
    }
    return errors;
  }

  const unitErr = requiredText(unitNumber, "Unit number", { max: LIMITS.profileUnit });
  if (unitErr) errors.unitNumber = unitErr;

  if (!residenceType) {
    errors.residenceType = "Residence type is required.";
  } else if (!["homeowner", "tenant"].includes(residenceType)) {
    errors.residenceType = "Select homeowner or tenant.";
  }

  if (requireUtilityFile) {
    if (!utilityFile?.uri) {
      errors.utilityFile = "Lease or utility bill is required.";
    } else if (utilityFile.fileSize && utilityFile.fileSize > LIMITS.utilityBillMaxBytes) {
      errors.utilityFile = "File must be 10 MB or smaller.";
    }
  } else if (utilityFile?.uri && utilityFile.fileSize && utilityFile.fileSize > LIMITS.utilityBillMaxBytes) {
    errors.utilityFile = "File must be 10 MB or smaller.";
  }

  return errors;
}

export function validateFeedPostForm({ body, hasImage }) {
  const errors = {};
  const text = String(body ?? "").trim();

  if (!text && !hasImage) {
    errors.body = "Write something or add a photo before posting.";
  }
  if (text.length > LIMITS.feedPost) {
    errors.body = `Post must be ${LIMITS.feedPost} characters or less.`;
  }
  return errors;
}

export function validateFeedCommentForm(body) {
  const errors = {};
  const text = String(body ?? "").trim();
  if (!text) errors.body = "Comment cannot be empty.";
  else if (text.length > LIMITS.feedComment) {
    errors.body = `Comment must be ${LIMITS.feedComment} characters or less.`;
  }
  return errors;
}

export function validateBusinessForm(form, { phoneDigits, phoneCountry, isValidPhoneFn }) {
  const errors = {};

  const nameErr = requiredText(form.business, "Business name", { max: LIMITS.businessName });
  if (nameErr) errors.business = nameErr;

  const catErr = requiredText(form.category, "Category", { max: LIMITS.businessCategory });
  if (catErr) errors.category = catErr;

  const addrErr = requiredText(form.address, "Address", { max: LIMITS.businessAddress });
  if (addrErr) errors.address = addrErr;

  if (!String(phoneDigits ?? "").trim()) {
    errors.phone = "Phone number is required.";
  } else if (isValidPhoneFn && !isValidPhoneFn(phoneDigits, phoneCountry)) {
    errors.phone = "Enter a valid phone number.";
  }

  const hoursErr = requiredText(form.hours, "Business hours", { max: LIMITS.businessHours });
  if (hoursErr) errors.hours = hoursErr;

  const descErr = requiredText(form.description, "Description", { max: LIMITS.businessDescription });
  if (descErr) errors.description = descErr;

  return errors;
}

export function validateListingForm(form, { listingType }) {
  const errors = {};

  const titleErr = requiredText(form.title, "Title", { max: LIMITS.listingTitle });
  if (titleErr) errors.title = titleErr;

  const descErr = requiredText(form.description, "Description");
  if (descErr) errors.description = descErr;

  const priceRaw = String(form.price ?? "").trim();
  if (!priceRaw) {
    errors.price = "Price is required.";
  } else if (Number.isNaN(Number(priceRaw)) || Number(priceRaw) < 0) {
    errors.price = "Enter a valid price (0 or greater).";
  }

  const catErr = requiredText(form.category, "Category", { max: LIMITS.listingCategory });
  if (catErr) errors.category = catErr;

  if (listingType === "item" && !form.condition) {
    errors.condition = "Item condition is required.";
  }

  const loc = String(form.location ?? "").trim();
  if (loc.length > LIMITS.listingLocation) {
    errors.location = `Location must be ${LIMITS.listingLocation} characters or less.`;
  }

  if ((form.photos?.length ?? 0) > 6) {
    errors.photos = "You can add up to 6 photos.";
  }

  return errors;
}

export function validateDealForm(form, { businessStatus } = {}) {
  const errors = {};

  if (businessStatus === "rejected") {
    errors.business = "Your business was rejected. Re-submit it before creating deals.";
  } else if (businessStatus === "pending") {
    errors.business = "Your business is pending approval.";
  } else if (!form.hasBusiness) {
    errors.business = "Add a business profile before creating a deal.";
  }

  const titleErr = requiredText(form.dealTitle, "Deal title", { max: LIMITS.dealTitle });
  if (titleErr) errors.dealTitle = titleErr;

  const discountErr = requiredText(form.discountLabel, "Discount label", { max: LIMITS.dealDiscount });
  if (discountErr) errors.discountLabel = discountErr;

  const categoryErr = requiredText(form.category, "Category", { max: LIMITS.dealCategory });
  if (categoryErr) errors.category = categoryErr;

  const descErr = requiredText(form.description, "Description", { max: LIMITS.dealDescription });
  if (descErr) errors.description = descErr;

  if (!form.hasImage) {
    errors.image = "Deal image is required.";
  }

  return errors;
}

export function validateCommunityRequestForm({ communityName, address, regionId }) {
  const errors = {};

  const name = String(communityName ?? "").trim();
  if (!name) errors.communityName = "Community name is required.";
  else if (name.length < 2) errors.communityName = "Community name must be at least 2 characters.";
  else if (name.length > LIMITS.communityName) {
    errors.communityName = `Community name must be ${LIMITS.communityName} characters or less.`;
  }

  const addr = String(address ?? "").trim();
  if (!addr) errors.address = "Address is required.";
  else if (addr.length < 5) errors.address = "Address must be at least 5 characters.";
  else if (addr.length > LIMITS.communityAddress) {
    errors.address = `Address must be ${LIMITS.communityAddress} characters or less.`;
  }

  if (!regionId) errors.regionId = "Region is required.";

  return errors;
}

export function validateInviteCodeForm(inviteCode) {
  const errors = {};
  const code = String(inviteCode ?? "").trim();

  if (!code) {
    errors.inviteCode = "Invite code is required.";
  } else if (code.length < 6) {
    errors.inviteCode = "Invite code must be at least 6 characters.";
  } else if (code.length > LIMITS.inviteCode) {
    errors.inviteCode = `Invite code must be ${LIMITS.inviteCode} characters or less.`;
  }

  return errors;
}

export function validateInviteMemberForm({ name, email, unit }) {
  const errors = {};

  const nameErr = requiredText(name, "Full name", { min: 2, max: 100 });
  if (nameErr) errors.name = nameErr;

  const emailValue = String(email ?? "").trim();
  if (!emailValue) errors.email = "Email address is required.";
  else if (emailValue.length > 255) errors.email = "Email must be 255 characters or less.";
  else if (!EMAIL_RE.test(emailValue)) errors.email = "Enter a valid email address.";

  const unitStr = String(unit ?? "").trim();
  if (unitStr.length > LIMITS.inviteUnit) {
    errors.unit = `Unit must be ${LIMITS.inviteUnit} characters or less.`;
  }

  return errors;
}

export function validateCommunityRuleForm(form) {
  const errors = {};

  const titleErr = requiredText(form.title, "Title", { max: LIMITS.ruleTitle });
  if (titleErr) errors.title = titleErr;

  const catErr = requiredText(form.category, "Category", { max: LIMITS.ruleCategory });
  if (catErr) errors.category = catErr;

  const descErr = requiredText(form.description, "Description");
  if (descErr) errors.description = descErr;

  if (form.severity && !["important", "standard", "info"].includes(form.severity)) {
    errors.severity = "Select a valid severity.";
  }

  return errors;
}

export function validateDocumentForm(form, { hasFile }) {
  const errors = {};

  const titleErr = requiredText(form.title, "Title", { max: LIMITS.documentTitle });
  if (titleErr) errors.title = titleErr;

  const catErr = requiredText(form.category, "Category", { max: LIMITS.documentCategory });
  if (catErr) errors.category = catErr;

  if (!hasFile) errors.file = "Choose a file to upload.";

  return errors;
}

export function validateGuestInviteForm(form, { phoneCountry } = {}) {
  const errors = {};

  const nameErr = requiredText(form.guest_name, "Guest name", { min: 2, max: LIMITS.profileName });
  if (nameErr) errors.guest_name = nameErr;

  const digits = String(form.phone_digits ?? "").trim();
  if (!digits) {
    errors.guest_phone = "Phone number is required.";
  } else {
    const phoneErr = getPhoneValidationError(digits, phoneCountry);
    if (phoneErr) errors.guest_phone = phoneErr;
  }

  const email = String(form.guest_email ?? "").trim();
  const emailErr = validateUserEmail(email);
  if (emailErr) errors.guest_email = emailErr;

  if (!form.starts_at) {
    errors.starts_at = "Pick a start date and time.";
  }
  if (!form.ends_at) {
    errors.ends_at = "Pick an end date and time.";
  }
  if (form.starts_at && form.ends_at && new Date(form.ends_at).getTime() <= new Date(form.starts_at).getTime()) {
    errors.ends_at = "End must be after the start time.";
  }

  if (form.permissions) {
    const enabled = Object.values(normalizeGuestPermissions(form.permissions)).some(Boolean);
    if (!enabled) {
      errors.permissions = "Enable at least one permission for the guest.";
    }
  }

  return errors;
}
