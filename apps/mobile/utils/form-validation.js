/**
 * Mobile form validation — aligned with frontend dashboard validators
 * (frontend/src/lib/admin/*-validation.ts) and backend Laravel rules.
 */

import { RULE_SEVERITY_KEYS } from "../constants/community-rule-categories";
import { getPhoneValidationError } from "./phone";
import { normalizeGuestPermissions } from "../constants/guest-permissions";
import i18n from "../i18n";
import { noticePlainTextError } from "./notice-text-validation";
import { isScheduleEndBeforeStart, resolveEffectiveEndDate } from "./notice-schedule-window";

export const LIMITS = {
  noticeTitle: 200,
  eventTitle: 80,
  noticeBody: 5000,
  /** Resident notice & event create (mobile). */
  noticeDescription: 1000,
  noticeBodyMin: 10,
  noticeTitleMin: 3,
  location: 255,
  profileName: 50,
  guestName: 25,
  profileUnit: 50,
  communityAdminUnit: 20,
  officeAddress: 255,
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
  dealMenuItemName: 120,
  dealMenuItemDescription: 500,
  dealMenuItemPrice: 40,
  dealMenuItemsMax: 50,
  communityName: 150,
  communityAddress: 255,
  communityDescription: 1000,
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
  return (
    !value ||
    value.endsWith(PLACEHOLDER_EMAIL_SUFFIX) ||
    value.endsWith("@guest.havena.local")
  );
}

export function formatDisplayEmail(email) {
  if (isPlaceholderEmail(email)) return null;
  return String(email ?? "").trim();
}

export function validateUserEmail(email) {
  const value = String(email ?? "").trim();
  if (!value) return i18n.t("validation.emailRequired");
  if (value.length > LIMITS.profileEmail) {
    return i18n.t("validation.maxChars", { field: i18n.t("validation.fields.email"), max: LIMITS.profileEmail });
  }
  if (!EMAIL_RE.test(value)) return i18n.t("validation.emailInvalid");
  if (isPlaceholderEmail(value)) return i18n.t("validation.emailPersonal");
  return null;
}

export function hasFieldErrors(errors) {
  return Object.values(errors).some(Boolean);
}

export function applyCharacterLimit(current, next, max) {
  const value = String(next ?? "");
  const previous = String(current ?? "");
  if (value.length <= max) return value;
  if (value.length < previous.length) return value;
  if (previous.length >= max) return previous;
  return value.slice(0, max);
}

function exceedsCharacterLimit(value, max) {
  const text = String(value ?? "");
  return text.length > max || text.trim().length > max;
}

function requiredText(value, labelKey, { min, max } = {}) {
  const trimmed = String(value ?? "").trim();
  const label = i18n.t(labelKey);
  if (!trimmed) return i18n.t("validation.required", { field: label });
  if (min != null && trimmed.length < min) {
    return i18n.t("validation.minChars", { field: label, min });
  }
  if (max != null && trimmed.length > max) {
    return i18n.t("validation.maxChars", { field: label, max });
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
 * True when scheduled publish is strictly after the notice/alert start.
 * Missing start time compares calendar dates only.
 */
export function isSchedulePublishAfterStart(scheduledDate, scheduledTime, startDate, startTime) {
  const schedDay = String(scheduledDate ?? "").trim().slice(0, 10);
  const startDay = String(startDate ?? "").trim().slice(0, 10);
  if (!schedDay || !startDay) return false;

  const schedTime = String(scheduledTime ?? "").trim().slice(0, 5);
  if (!schedTime || parseTimeMinutes(schedTime) == null) return false;

  const startTimeRaw = String(startTime ?? "").trim();
  if (!startTimeRaw) {
    return schedDay > startDay;
  }

  const startNorm = startTimeRaw.slice(0, 5);
  if (parseTimeMinutes(startNorm) == null) return false;

  return `${schedDay}T${schedTime}` > `${startDay}T${startNorm}`;
}

/**
 * @param {{ title: string, body: string, location?: string, event_date?: string, event_time?: string, event_time_end?: string }} form
 * @param {{ kind?: 'notice'|'event'|'alert', publishNow?: boolean, requireSchedule?: boolean, requireLocation?: boolean }} opts
 */
export function validateNoticeForm(form, opts = {}) {
  const errors = {};
  const kind = opts.kind ?? "notice";

  const titleErr = requiredText(
    form.title,
    kind === "event" ? "validation.fields.eventName" : "validation.fields.title",
    {
      min: LIMITS.noticeTitleMin,
      max: kind === "event" ? LIMITS.eventTitle : LIMITS.noticeTitle,
    },
  );
  if (titleErr) errors.title = titleErr;
  else if (kind === "event") {
    const plain = noticePlainTextError(form.title, i18n.t("validation.fields.eventName"), { i18n });
    if (plain) errors.title = plain;
  }

  const bodyMax = kind === "alert" ? LIMITS.noticeBody : LIMITS.noticeDescription;
  const bodyErr = requiredText(form.body, "validation.fields.description", {
    min: LIMITS.noticeBodyMin,
    max: bodyMax,
  });
  if (bodyErr) errors.body = bodyErr;

  const location = String(form.location ?? "").trim();
  if (location.length > LIMITS.location) {
    errors.location = i18n.t("validation.maxChars", { field: i18n.t("validation.fields.location"), max: LIMITS.location });
  }
  if (opts.requireLocation && !location) {
    errors.location = i18n.t("validation.locationRequired");
  } else if (kind === "event" && location) {
    const plain = noticePlainTextError(location, i18n.t("validation.fields.location"), { i18n });
    if (plain) errors.location = plain;
  }

  if (kind === "notice") {
    const allowed = new Set(["general", "maintenance", "security", "finance"]);
    const category = String(form.category ?? "").trim();
    if (!category || !allowed.has(category)) {
      errors.category = i18n.t("validation.categoryRequired");
    }
  }

  if (opts.requireSchedule) {
    if (!String(form.event_date ?? "").trim()) {
      errors.event_date = i18n.t("validation.dateRequiredSchedule");
    }
    if (kind === "event") {
      if (!resolveEffectiveEndDate(form.event_date, form.event_end_date).trim()) {
        errors.event_end_date = i18n.t("validation.endDateRequired");
      }
      if (!String(form.event_time ?? "").trim()) {
        errors.event_time = i18n.t("validation.startTimeRequiredSchedule");
      }
      if (!String(form.event_time_end ?? "").trim()) {
        errors.event_time_end = i18n.t("validation.endTimeRequiredSchedule");
      }
    } else if (kind === "notice" || kind === "alert") {
      if (!String(form.event_time ?? "").trim()) {
        errors.event_time = i18n.t("validation.startTimeRequiredSchedule");
      }
    }
  }

  const scheduledDate = String(form.scheduled_date ?? "").trim();
  const scheduledTime = String(form.scheduled_time ?? "").trim();

  if (opts.requirePublishSchedule) {
    if (!scheduledDate) {
      errors.scheduled_date = i18n.t("validation.publishDateRequired");
    }
    if (!scheduledTime) {
      errors.scheduled_time = i18n.t("validation.publishTimeRequired");
    }
  }

  if (scheduledDate && scheduledTime && !errors.scheduled_date && !errors.scheduled_time) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (scheduledDate < today) {
      errors.scheduled_date = i18n.t("validation.publishMustBeFuture");
    } else if (scheduledDate === today) {
      const schedMin = parseTimeMinutes(scheduledTime);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (schedMin != null && schedMin < nowMin) {
        errors.scheduled_time = i18n.t("validation.publishMustBeFuture");
      }
    }

    if (
      !errors.scheduled_date &&
      !errors.scheduled_time &&
      String(form.event_date ?? "").trim() &&
      isSchedulePublishAfterStart(scheduledDate, scheduledTime, form.event_date, form.event_time)
    ) {
      errors.scheduled_time = i18n.t("validation.publishScheduleAfterStart");
    }
  }

  const scheduleKinds = ["notice", "event", "alert"];
  if (opts.publishNow && scheduleKinds.includes(kind)) {
    const dateLabelKey =
      kind === "event"
        ? "validation.fields.startDate"
        : kind === "alert"
          ? "validation.fields.alertDate"
          : "validation.fields.startDate";
    if (!String(form.event_date ?? "").trim()) {
      errors.event_date = i18n.t("validation.required", { field: i18n.t(dateLabelKey) });
    }
    if (kind === "event") {
      if (!resolveEffectiveEndDate(form.event_date, form.event_end_date).trim()) {
        errors.event_end_date = i18n.t("validation.endDateRequired");
      }
      if (!String(form.event_time ?? "").trim()) {
        errors.event_time = i18n.t("validation.startTimeRequired");
      }
      if (!String(form.event_time_end ?? "").trim()) {
        errors.event_time_end = i18n.t("validation.endTimeRequired");
      }
    } else if (kind === "notice" || kind === "alert") {
      if (!String(form.event_time ?? "").trim()) {
        errors.event_time = i18n.t("validation.startTimeRequired");
      }
    }
  }

  const effectiveEndDate = resolveEffectiveEndDate(form.event_date, form.event_end_date);
  if (
    form.event_date?.trim() &&
    effectiveEndDate &&
    effectiveEndDate < String(form.event_date).trim().slice(0, 10)
  ) {
    errors.event_end_date = i18n.t("validation.endDateBeforeStart");
  }

  if (
    form.event_time?.trim() &&
    form.event_time_end?.trim() &&
    isScheduleEndBeforeStart(form.event_date, form.event_time, form.event_end_date, form.event_time_end)
  ) {
    errors.event_time_end = i18n.t("validation.endAfterStart");
  }

  if (
    (kind === "event" || kind === "notice" || kind === "alert") &&
    effectiveEndDate &&
    String(form.event_time_end ?? "").trim()
  ) {
    const endMin = parseTimeMinutes(form.event_time_end);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (effectiveEndDate === today && endMin != null) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (endMin <= nowMin) {
        errors.event_time_end = i18n.t("validation.endAfterNow");
      }
    }
  }

  if (kind === "notice" && form.audience_type === "selected" && (form.recipient_user_ids?.length ?? 0) === 0) {
    errors.recipient_user_ids = i18n.t("validation.selectResident");
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
  phoneDigits,
  phoneCountry,
  bio,
  unitNumber,
  residenceType,
  officeAddress = "",
  utilityFile,
  requireUtilityFile = true,
  requireResidenceType = true,
  requireUnitNumber,
  requireOfficeAddress,
  guestMode = false,
  communityAdmin = false,
}) {
  const errors = {};
  const nameMax = LIMITS.profileName;
  const unitMax = communityAdmin ? LIMITS.communityAdminUnit : LIMITS.profileUnit;
  const officeMax = LIMITS.officeAddress;
  const unitIsRequired = requireUnitNumber ?? (!guestMode && !communityAdmin);
  const officeIsRequired = requireOfficeAddress ?? communityAdmin;

  const nameErr = requiredText(name, "validation.fields.fullName", { min: 2, max: nameMax });
  if (nameErr) {
    errors.name = communityAdmin && exceedsCharacterLimit(name, nameMax)
      ? i18n.t("validation.communityAdminNameMax")
      : nameErr;
  }

  const emailErr = validateUserEmail(email);
  if (emailErr) errors.email = emailErr;

  const digits = String(phoneDigits ?? "").trim();
  if (!digits) {
    errors.phone = i18n.t("validation.phoneRequired");
  } else {
    const phoneErr = getPhoneValidationError(digits, phoneCountry);
    if (phoneErr) errors.phone = phoneErr;
  }

  const bioText = String(bio ?? "").trim();
  if (bioText.length > LIMITS.profileBio) {
    errors.bio = i18n.t("validation.maxChars", { field: i18n.t("validation.fields.bio"), max: LIMITS.profileBio });
  }

  if (guestMode) {
    const unitText = String(unitNumber ?? "").trim();
    if (String(unitNumber ?? "").length > unitMax || unitText.length > unitMax) {
      errors.unitNumber = i18n.t("validation.maxChars", { field: i18n.t("validation.fields.unitNumber"), max: unitMax });
    }
    return errors;
  }

  if (officeIsRequired) {
    const officeErr = requiredText(officeAddress, "validation.fields.officeAddress", { max: officeMax });
    if (officeErr) {
      errors.officeAddress = exceedsCharacterLimit(officeAddress, officeMax)
        ? i18n.t("validation.communityAdminOfficeMax")
        : officeErr;
    }
  } else if (String(officeAddress ?? "").trim().length > officeMax) {
    errors.officeAddress = i18n.t("validation.communityAdminOfficeMax");
  }

  if (unitIsRequired) {
  const unitErr = requiredText(unitNumber, "validation.fields.unitNumber", { max: unitMax });
  if (unitErr) {
    errors.unitNumber = communityAdmin && exceedsCharacterLimit(unitNumber, unitMax)
      ? i18n.t("validation.communityAdminUnitMax")
      : unitErr;
  }
  }

  if (requireResidenceType && !communityAdmin) {
    if (!residenceType) {
      errors.residenceType = i18n.t("validation.residenceTypeRequired");
    } else if (!["homeowner", "tenant"].includes(residenceType)) {
      errors.residenceType = i18n.t("validation.selectResidenceType");
    }
  }

  if (requireUtilityFile) {
    if (!utilityFile?.uri) {
      errors.utilityFile = i18n.t("validation.utilityRequired");
    } else if (utilityFile.fileSize && utilityFile.fileSize > LIMITS.utilityBillMaxBytes) {
      errors.utilityFile = i18n.t("validation.fileTooBig");
    }
  } else if (utilityFile?.uri && utilityFile.fileSize && utilityFile.fileSize > LIMITS.utilityBillMaxBytes) {
    errors.utilityFile = i18n.t("validation.fileTooBig");
  }

  return errors;
}

export function validateFeedPostForm({ body, hasImage }) {
  const errors = {};
  const text = String(body ?? "").trim();

  if (!text && !hasImage) {
    errors.body = i18n.t("validation.postEmpty");
  }
  if (text.length > LIMITS.feedPost) {
    errors.body = i18n.t("validation.maxChars", { field: i18n.t("validation.fields.post"), max: LIMITS.feedPost });
  }
  return errors;
}

export function validateFeedCommentForm(body) {
  const errors = {};
  const text = String(body ?? "").trim();
  if (!text) errors.body = i18n.t("validation.commentEmpty");
  else if (text.length > LIMITS.feedComment) {
    errors.body = i18n.t("validation.maxChars", { field: i18n.t("validation.fields.comment"), max: LIMITS.feedComment });
  }
  return errors;
}

export function validateBusinessForm(form, { phoneDigits, phoneCountry, isValidPhoneFn }) {
  const errors = {};

  const nameErr = requiredText(form.business, "validation.fields.businessName", { max: LIMITS.businessName });
  if (nameErr) errors.business = nameErr;

  const catErr = requiredText(form.category, "validation.fields.category", { max: LIMITS.businessCategory });
  if (catErr) errors.category = catErr;

  const addrErr = requiredText(form.address, "validation.fields.address", { max: LIMITS.businessAddress });
  if (addrErr) errors.address = addrErr;

  if (!String(phoneDigits ?? "").trim()) {
    errors.phone = i18n.t("validation.phoneRequired");
  } else if (isValidPhoneFn && !isValidPhoneFn(phoneDigits, phoneCountry)) {
    errors.phone = i18n.t("validation.phoneInvalid");
  }

  const hoursErr = requiredText(form.hours, "validation.fields.businessHours", { max: LIMITS.businessHours });
  if (hoursErr) errors.hours = hoursErr;

  const descErr = requiredText(form.description, "validation.fields.description", { max: LIMITS.businessDescription });
  if (descErr) errors.description = descErr;

  return errors;
}

export function validateListingForm(form, { listingType }) {
  const errors = {};

  const titleErr = requiredText(form.title, "validation.fields.title", { max: LIMITS.listingTitle });
  if (titleErr) errors.title = titleErr;

  const descErr = requiredText(form.description, "validation.fields.description");
  if (descErr) errors.description = descErr;

  const priceRaw = String(form.price ?? "").trim();
  if (!priceRaw) {
    errors.price = i18n.t("validation.priceRequired");
  } else if (Number.isNaN(Number(priceRaw)) || Number(priceRaw) < 0) {
    errors.price = i18n.t("validation.priceInvalid");
  }

  const catErr = requiredText(form.category, "validation.fields.category", { max: LIMITS.listingCategory });
  if (catErr) errors.category = catErr;

  if (listingType === "item" && !form.condition) {
    errors.condition = i18n.t("validation.conditionRequired");
  }

  const loc = String(form.location ?? "").trim();
  if (loc.length > LIMITS.listingLocation) {
    errors.location = i18n.t("validation.maxChars", { field: i18n.t("validation.fields.location"), max: LIMITS.listingLocation });
  }

  if ((form.photos?.length ?? 0) > 6) {
    errors.photos = i18n.t("validation.maxPhotos");
  }

  return errors;
}

export function validateDealForm(form, { businessStatus, isAdmin = false } = {}) {
  const errors = {};

  if (!isAdmin) {
    if (businessStatus === "rejected") {
      errors.business = i18n.t("validation.businessRejected");
    } else if (businessStatus === "pending") {
      errors.business = i18n.t("validation.businessPending");
    } else if (!form.hasBusiness) {
      errors.business = i18n.t("validation.businessRequired");
    }
  } else if (!form.hasBusiness) {
    errors.business = i18n.t("validation.businessRequired");
  }

  const titleErr = requiredText(form.dealTitle, "validation.fields.dealTitle", { max: LIMITS.dealTitle });
  if (titleErr) errors.dealTitle = titleErr;

  const discountErr = requiredText(form.discountLabel, "validation.fields.discountLabel", { max: LIMITS.dealDiscount });
  if (discountErr) errors.discountLabel = discountErr;

  const categoryErr = requiredText(form.category, "validation.fields.category", { max: LIMITS.dealCategory });
  if (categoryErr) errors.category = categoryErr;

  const descErr = requiredText(form.description, "validation.fields.description", { max: LIMITS.dealDescription });
  if (descErr) errors.description = descErr;

  if (!form.hasImage) {
    errors.image = i18n.t("validation.dealImageRequired");
  }

  return errors;
}

export function validateDealMenuItem(form = {}) {
  const errors = {};

  const nameErr = requiredText(form.name, "validation.fields.menuItemName", {
    max: LIMITS.dealMenuItemName,
  });
  if (nameErr) errors.name = nameErr;

  const description = String(form.description ?? "").trim();
  if (description.length > LIMITS.dealMenuItemDescription) {
    errors.description = i18n.t("validation.maxChars", {
      field: i18n.t("validation.fields.description"),
      max: LIMITS.dealMenuItemDescription,
    });
  }

  const price = String(form.price ?? "").trim();
  if (price.length > LIMITS.dealMenuItemPrice) {
    errors.price = i18n.t("validation.maxChars", {
      field: i18n.t("validation.fields.price"),
      max: LIMITS.dealMenuItemPrice,
    });
  }

  return errors;
}

export function validateCommunityRequestForm({ communityName, address, regionId, description }) {
  const errors = {};

  const nameErr = requiredText(communityName, "validation.fields.communityName", { min: 2, max: LIMITS.communityName });
  if (nameErr) errors.communityName = nameErr;

  const addrErr = requiredText(address, "validation.fields.address", { min: 5, max: LIMITS.communityAddress });
  if (addrErr) errors.address = addrErr;

  const notes = String(description ?? "").trim();
  if (notes.length > LIMITS.communityDescription) {
    errors.description = i18n.t("validation.maxChars", {
      field: i18n.t("guests.descriptionLabel"),
      max: LIMITS.communityDescription,
    });
  }

  if (!regionId) errors.regionId = i18n.t("validation.regionRequired");

  return errors;
}

export function validateInviteCodeForm(inviteCode) {
  const errors = {};

  const codeErr = requiredText(inviteCode, "validation.fields.inviteCode", { min: 6, max: LIMITS.inviteCode });
  if (codeErr) errors.inviteCode = codeErr;

  return errors;
}

/** Guest host codes look like GST-XXXX-1234 (spaces/dashes optional while typing). */
export function validateGuestInviteCodeForm(inviteCode) {
  const errors = {};
  const raw = String(inviteCode ?? "").trim();

  if (!raw) {
    errors.inviteCode = i18n.t("validation.inviteCodeRequired");
    return errors;
  }

  if (raw.length > LIMITS.inviteCode) {
    errors.inviteCode = i18n.t("validation.maxChars", {
      field: i18n.t("validation.fields.inviteCode"),
      max: LIMITS.inviteCode,
    });
    return errors;
  }

  const compact = raw.toUpperCase().replace(/[\s-]+/g, "");
  const match = compact.match(/^GST([A-Z0-9]{4})(\d{4})$/);
  if (match) return errors;

  if (compact.startsWith("GST")) {
    errors.inviteCode = i18n.t("validation.guestInviteCodeInvalid");
    return errors;
  }

  if (compact.length < 6) {
    errors.inviteCode = i18n.t("validation.minChars", {
      field: i18n.t("validation.fields.inviteCode"),
      min: 6,
    });
  }

  return errors;
}

export function validateInviteMemberForm({ name, email, unit, phoneDigits, phoneCountry }) {
  const errors = {};

  const nameErr = requiredText(name, "validation.fields.fullName", { min: 2, max: 100 });
  if (nameErr) errors.name = nameErr;

  const emailValue = String(email ?? "").trim();
  if (!emailValue) errors.email = i18n.t("validation.emailRequired");
  else if (emailValue.length > 255) errors.email = i18n.t("validation.maxChars", { field: i18n.t("validation.fields.email"), max: 255 });
  else if (!EMAIL_RE.test(emailValue)) errors.email = i18n.t("validation.emailInvalid");

  const digits = String(phoneDigits ?? "").trim();
  if (!digits) {
    errors.phone = i18n.t("validation.phoneRequired");
  } else {
    const phoneErr = getPhoneValidationError(digits, phoneCountry);
    if (phoneErr) errors.phone = phoneErr;
  }

  const unitStr = String(unit ?? "").trim();
  if (unitStr.length > LIMITS.inviteUnit) {
    errors.unit = i18n.t("validation.maxChars", { field: i18n.t("validation.fields.unit"), max: LIMITS.inviteUnit });
  }

  return errors;
}

export function validateCommunityRuleForm(form) {
  const errors = {};

  const titleErr = requiredText(form.title, "validation.fields.title", { max: LIMITS.ruleTitle });
  if (titleErr) errors.title = titleErr;

  const catErr = requiredText(form.category, "validation.fields.category", { max: LIMITS.ruleCategory });
  if (catErr) errors.category = catErr;

  const descErr = requiredText(form.description, "validation.fields.description");
  if (descErr) errors.description = descErr;

  if (form.severity && !RULE_SEVERITY_KEYS.includes(form.severity)) {
    errors.severity = i18n.t("validation.severityInvalid");
  }

  return errors;
}

export function validateDocumentForm(form, { hasFile }) {
  const errors = {};

  const titleErr = requiredText(form.title, "validation.fields.title", { max: LIMITS.documentTitle });
  if (titleErr) errors.title = titleErr;

  const catErr = requiredText(form.category, "validation.fields.category", { max: LIMITS.documentCategory });
  if (catErr) errors.category = catErr;

  if (!hasFile) errors.file = i18n.t("validation.fileRequired");

  return errors;
}

export const GUEST_ACCESS_MAX_YEARS = 1;

export function addCalendarYears(date, years) {
  const next = new Date(date.getTime());
  const month = next.getMonth();
  next.setFullYear(next.getFullYear() + years);
  if (next.getMonth() !== month) {
    next.setDate(0);
  }
  return next;
}

export function validateGuestInviteForm(form, { phoneCountry } = {}) {
  const errors = {};

  const nameErr = requiredText(form.guest_name, "validation.fields.guestName", { min: 2, max: LIMITS.guestName });
  if (nameErr) errors.guest_name = nameErr;

  const digits = String(form.phone_digits ?? "").trim();
  if (digits) {
    const phoneErr = getPhoneValidationError(digits, phoneCountry);
    if (phoneErr) errors.guest_phone = phoneErr;
  }

  const email = String(form.guest_email ?? "").trim();
  const emailErr = validateUserEmail(email);
  if (emailErr) errors.guest_email = emailErr;

  if (!form.starts_at) {
    errors.starts_at = i18n.t("validation.startDateRequired");
  }
  if (!form.ends_at) {
    errors.ends_at = i18n.t("validation.endDateRequired");
  }
  if (form.starts_at && form.ends_at) {
    const start = new Date(form.starts_at);
    const end = new Date(form.ends_at);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (end.getTime() <= start.getTime()) {
        errors.ends_at = i18n.t("validation.endAfterStart");
      } else if (end.getTime() > addCalendarYears(start, GUEST_ACCESS_MAX_YEARS).getTime()) {
        errors.ends_at = i18n.t("validation.guestAccessMaxDuration");
      }
    }
  }

  if (form.permissions) {
    const enabled = Object.values(normalizeGuestPermissions(form.permissions)).some(Boolean);
    if (!enabled) {
      errors.permissions = i18n.t("validation.guestPermissionRequired");
    }
  }

  return errors;
}
