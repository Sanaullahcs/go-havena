import { type FieldErrors } from "@/lib/admin/form-validation-utils";
import { noticePlainTextError } from "@/lib/admin/notice-text-validation";
import {
  isNoticeDateInPast,
  isNoticeTimeInPast,
  isScheduleEndBeforeStart,
  NOTICE_FUTURE_TIME_MESSAGE,
  resolveEffectiveEndDate,
} from "@/lib/admin/notice-schedule-utils";

export type NoticeFormLike = {
  title: string;
  body: string;
  category: string;
  location: string;
  event_date: string;
  event_end_date: string;
  event_time: string;
  event_time_end: string;
  event_capacity?: string;
  requires_rsvp?: boolean;
  is_pinned?: boolean;
  schedule_later?: boolean;
  scheduled_at_date?: string;
  scheduled_at_time?: string;
  audience_type?: "all" | "selected";
  recipient_user_ids?: number[];
};

export type NoticeFormKind = "notice" | "event" | "alert";

const SCHEDULE_KINDS: NoticeFormKind[] = ["notice", "event", "alert"];

export function validateNoticeForm(
  form: NoticeFormLike,
  opts: {
    kind?: NoticeFormKind;
    lockedCategory?: string;
    publishNow?: boolean;
    /** Enforce current/future times when notice date is today (create flow). */
    enforceFutureTimes?: boolean;
    now?: Date;
    timeZone?: string;
  } = {},
): FieldErrors {
  const errors: FieldErrors = {};
  const kind = opts.kind ?? (opts.lockedCategory === "event" ? "event" : opts.lockedCategory === "emergency" ? "alert" : "notice");
  const now = opts.now ?? new Date();
  const enforceFutureTimes = opts.enforceFutureTimes !== false;

  const title = form.title.trim();
  if (!title) {
    errors.title = "Title is required.";
  } else if (title.length < 3) {
    errors.title = "Title must be at least 3 characters.";
  } else if (title.length > 200) {
    errors.title = "Title must be 200 characters or less.";
  } else if (kind === "event") {
    const plain = noticePlainTextError(form.title, "Event name");
    if (plain) errors.title = plain;
  }

  const body = form.body.trim();
  if (!body) {
    errors.body = "Description is required.";
  } else if (body.length < 10) {
    errors.body = "Description must be at least 10 characters.";
  } else if (body.length > 5000) {
    errors.body = "Description must be 5000 characters or less.";
  }

  const location = form.location.trim();
  if (location.length > 255) {
    errors.location = "Location must be 255 characters or less.";
  }
  if (kind === "event" && !location) {
    errors.location = "Location is required.";
  } else if (kind === "event" && location) {
    const plain = noticePlainTextError(form.location, "Location");
    if (plain) errors.location = plain;
  }

  if (opts.publishNow && SCHEDULE_KINDS.includes(kind)) {
    const dateLabel =
      kind === "event" ? "Start date" : kind === "alert" ? "Alert date" : "Start date";
    if (!form.event_date.trim()) {
      errors.event_date = `${dateLabel} is required.`;
    }
    if (kind !== "alert") {
      if (!resolveEffectiveEndDate(form.event_date, form.event_end_date).trim()) {
        errors.event_end_date = "End date is required.";
      }
      if (!form.event_time.trim()) {
        errors.event_time = "Start time is required.";
      }
      if (!form.event_time_end.trim()) {
        errors.event_time_end = "End time is required.";
      }
    }
  }

  const effectiveEndDate = resolveEffectiveEndDate(form.event_date, form.event_end_date);
  const pastMessage = NOTICE_FUTURE_TIME_MESSAGE;

  if (enforceFutureTimes) {
    if (form.event_date.trim() && isNoticeDateInPast(form.event_date, now, opts.timeZone)) {
      errors.event_date = pastMessage;
    }
    if (kind !== "alert" && form.event_end_date.trim() && isNoticeDateInPast(form.event_end_date, now, opts.timeZone)) {
      errors.event_end_date = pastMessage;
    }
    if (form.event_date.trim() && form.event_time.trim() && isNoticeTimeInPast(form.event_date, form.event_time, now, opts.timeZone)) {
      errors.event_time = pastMessage;
    }
    if (
      form.event_time_end.trim() &&
      effectiveEndDate &&
      isNoticeTimeInPast(effectiveEndDate, form.event_time_end, now, opts.timeZone)
    ) {
      errors.event_time_end = pastMessage;
    }
  }

  if (
    form.event_date.trim() &&
    effectiveEndDate &&
    effectiveEndDate < form.event_date.trim().slice(0, 10)
  ) {
    errors.event_end_date = "End date must be on or after the start date.";
  }

  if (
    form.event_time.trim() &&
    form.event_time_end.trim() &&
    !errors.event_time_end &&
    isScheduleEndBeforeStart(form.event_date, form.event_time, form.event_end_date, form.event_time_end)
  ) {
    errors.event_time_end = "End time must be after start time.";
  }

  if (kind === "event" && String(form.event_capacity ?? "").trim()) {
    const capacity = Number(String(form.event_capacity).trim());
    if (!Number.isInteger(capacity) || capacity < 1) {
      errors.event_capacity = "Capacity must be a whole number of at least 1.";
    } else if (capacity > 100000) {
      errors.event_capacity = "Capacity must be 100,000 or less.";
    }
  }

  if (SCHEDULE_KINDS.includes(kind) && opts.publishNow && form.schedule_later) {
    if (!String(form.scheduled_at_date ?? "").trim()) {
      errors.scheduled_at_date = "Publish date is required when scheduling.";
    }
    if (!String(form.scheduled_at_time ?? "").trim()) {
      errors.scheduled_at_time = "Publish time is required when scheduling.";
    }
  }

  if (kind === "notice" && form.audience_type === "selected" && (form.recipient_user_ids?.length ?? 0) === 0) {
    errors.recipient_user_ids = "Select at least one resident.";
  }

  return errors;
}
