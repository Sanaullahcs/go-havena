"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  type Notice,
  type NoticeFormData,
  NOTICE_CATEGORIES,
  uploadNoticeImage,
} from "@/lib/api/notices";
import { apiError } from "@/lib/api/client";
import { toastError } from "@/lib/alert";
import {
  validateNoticeForm,
  type NoticeFormKind,
} from "@/lib/admin/notice-form-validation";
import { hasFieldErrors, inputClass, type FieldErrors } from "@/lib/admin/form-validation-utils";
import {
  addMinutesToTime,
  buildSchedulePreview,
  parseScheduledAtForForm,
  toScheduleApiDateTime,
  type SchedulePreview,
} from "@/lib/admin/notice-schedule-utils";
import { ThemedDatePicker } from "@/components/ui/themed-date-picker";
import { ThemedTimePicker } from "@/components/ui/themed-time-picker";
import { NoticeAudienceField } from "@/components/admin/notice-audience-field";
import { AdminBadge } from "@/components/admin/ui";

export type NoticeFormValues = {
  title: string;
  body: string;
  category: string;
  location: string;
  event_date: string;
  event_time: string;
  event_time_end: string;
  event_capacity: string;
  image_url: string;
  status: "draft" | "published" | "archived";
  requires_rsvp: boolean;
  is_pinned: boolean;
  schedule_later: boolean;
  scheduled_at_date: string;
  scheduled_at_time: string;
  audience_type: "all" | "selected";
  recipient_user_ids: number[];
};

const NOTICE_STATUS_META: Record<
  NoticeFormValues["status"],
  { tone: "green" | "amber" | "slate"; label: string }
> = {
  draft: { tone: "amber", label: "Draft" },
  published: { tone: "green", label: "Published" },
  archived: { tone: "slate", label: "Archived" },
};

const EMPTY_FORM: NoticeFormValues = {
  title: "",
  body: "",
  category: "general",
  location: "",
  event_date: "",
  event_time: "",
  event_time_end: "",
  event_capacity: "",
  image_url: "",
  status: "draft",
  requires_rsvp: false,
  is_pinned: false,
  schedule_later: false,
  scheduled_at_date: "",
  scheduled_at_time: "",
  audience_type: "all",
  recipient_user_ids: [],
};

const CAT_COLORS: Record<string, string> = {
  general: "#64748b",
  maintenance: "#d97706",
  event: "#7c3aed",
  security: "#1B4F8A",
  finance: "#059669",
  emergency: "#dc2626",
};

function noticeToForm(notice: Notice): NoticeFormValues {
  const { date: scheduledDate, time: scheduledTime } = parseScheduledAtForForm(notice.scheduled_at);

  return {
    title: notice.title ?? "",
    body: notice.body ?? "",
    category: notice.category ?? "general",
    location: notice.location ?? "",
    event_date: notice.event_date ? notice.event_date.slice(0, 10) : "",
    event_time: notice.event_time ? normalizeTimeValue(notice.event_time) : "",
    event_time_end: notice.event_time_end ? normalizeTimeValue(notice.event_time_end) : "",
    event_capacity: notice.event_capacity != null ? String(notice.event_capacity) : "",
    image_url: notice.image_url ?? "",
    status: (notice.status as NoticeFormValues["status"]) ?? "draft",
    requires_rsvp: Boolean(notice.requires_rsvp),
    is_pinned: Boolean(notice.is_pinned),
    schedule_later: Boolean(notice.scheduled_at && notice.status === "draft"),
    scheduled_at_date: scheduledDate,
    scheduled_at_time: scheduledTime,
    audience_type: notice.audience_type === "selected" ? "selected" : "all",
    recipient_user_ids: notice.recipient_user_ids ?? [],
  };
}

/** Normalize HH:mm from API values like "9:00:00" or "09:00". */
function normalizeTimeValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(":");
  if (parts.length < 2) return trimmed.slice(0, 5);
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return trimmed.slice(0, 5);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initial?: Notice | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (values: NoticeFormData) => Promise<void>;
  defaultCategory?: string;
  lockedCategory?: string;
};

export default function NoticeFormModal({
  open,
  mode,
  initial,
  submitting = false,
  onClose,
  onSubmit,
  defaultCategory = "general",
  lockedCategory,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<NoticeFormValues>(EMPTY_FORM);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = initial ? noticeToForm(initial) : { ...EMPTY_FORM, category: lockedCategory ?? defaultCategory };
    setForm(base);
    setPreview(initial?.image_url ?? null);
    setImageFile(null);
    setLocalError(null);
    setErrors({});
    setTouched({});
    setSubmitAttempted(false);
  }, [open, initial, defaultCategory, lockedCategory]);

  const schedulePreview = useMemo(
    () => buildSchedulePreview(form.event_date, form.event_time, form.event_time_end),
    [form.event_date, form.event_time, form.event_time_end],
  );

  const applyDurationFromStart = (hours: number) => {
    if (!form.event_time.trim()) return;
    set("event_time_end", addMinutesToTime(form.event_time, hours * 60));
    clearFieldError("event_time_end");
  };

  const isAlertForm = lockedCategory === "emergency";
  const isEventForm = lockedCategory === "event";
  const isNoticeForm = !isEventForm && !isAlertForm;
  const scheduleTitle = isAlertForm
    ? "Alert schedule"
    : isEventForm
      ? "Event schedule"
      : "Notice schedule";
  const scheduleHint = isAlertForm
    ? "When is this alert active for residents?"
    : isEventForm
      ? "When should residents show up?"
      : "When is this notice relevant for residents?";
  const scheduleOptionalNote = isAlertForm
    ? "Alert date is required. Start and end times are optional."
    : isNoticeForm
      ? "Notice date, start time, and end time are required."
      : "Event date, start time, and end time are required.";

  const formKind: NoticeFormKind = isEventForm ? "event" : isAlertForm ? "alert" : "notice";

  const showError = (field: string) => Boolean((submitAttempted || touched[field]) && errors[field]);

  const touch = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  const clearFieldError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const runValidation = (publishNow: boolean) =>
    validateNoticeForm(form, {
      kind: formKind,
      lockedCategory,
      publishNow,
    });

  const canPublishNow = useMemo(
    () => !hasFieldErrors(runValidation(true)),
    [form, formKind, lockedCategory],
  );

  const focusFirstError = (nextErrors: FieldErrors) => {
    const firstKey = Object.keys(nextErrors)[0];
    if (!firstKey || !formRef.current) return;
    formRef.current.querySelector<HTMLElement>(`[data-field="${firstKey}"]`)?.focus();
  };

  if (!open) return null;

  const busy = submitting || uploading;

  const set = <K extends keyof NoticeFormValues>(key: K, value: NoticeFormValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setLocalError(null);
    clearFieldError(key);
  };

  const handleImagePick = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      const message = "The cover must be a JPG, PNG, WEBP, or GIF image.";
      setLocalError(message);
      toastError(message);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const message = "The cover image must be 5 MB or smaller.";
      setLocalError(message);
      toastError(message);
      return;
    }
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setLocalError(null);
  };

  const handleSubmit = async (publishNow = false, forceStatus?: NoticeFormValues["status"]) => {
    setSubmitAttempted(true);
    const nextErrors = runValidation(publishNow);
    setErrors(nextErrors);
    if (hasFieldErrors(nextErrors)) {
      focusFirstError(nextErrors);
      toastError("Please fix the highlighted fields before saving.");
      return;
    }

    setLocalError(null);
    setUploading(true);

    try {
      let imageUrl = form.image_url.trim() || null;

      if (imageFile) {
        try {
          imageUrl = await uploadNoticeImage(imageFile);
        } catch (err) {
          const message = apiError(err);
          setLocalError(message);
          toastError(message);
          return;
        }
      }

      const status = publishNow && !form.schedule_later ? "published" : (forceStatus ?? form.status);

      const isEventCategory = isEventForm || form.category === "event";
      const supportsAdminOptions = isEventCategory || isNoticeForm || isAlertForm;

      const scheduledAt =
        supportsAdminOptions && form.schedule_later && form.scheduled_at_date && form.scheduled_at_time
          ? toScheduleApiDateTime(form.scheduled_at_date, form.scheduled_at_time)
          : undefined;

      try {
        await onSubmit({
          title: form.title.trim(),
          body: form.body.trim(),
          category: lockedCategory ?? form.category,
          location: isAlertForm ? undefined : form.location.trim() || undefined,
          image_url: imageUrl,
          event_date: form.event_date || undefined,
          event_time: form.event_time.trim() || undefined,
          event_time_end: form.event_time_end.trim() || undefined,
          event_capacity:
            isEventCategory && form.event_capacity.trim()
              ? Number(form.event_capacity.trim())
              : isEventCategory
                ? null
                : undefined,
          requires_rsvp: isEventCategory ? form.requires_rsvp : undefined,
          is_pinned: supportsAdminOptions && !isAlertForm ? form.is_pinned : undefined,
          scheduled_at: scheduledAt,
          status: supportsAdminOptions && form.schedule_later ? "draft" : status,
          ...(isNoticeForm
            ? {
                audience_type: form.audience_type,
                recipient_user_ids:
                  form.audience_type === "selected" ? form.recipient_user_ids : undefined,
              }
            : {}),
        });
      } catch (err) {
        setLocalError(apiError(err));
        throw err;
      }
    } finally {
      setUploading(false);
    }
  };

  const modalTitle =
    mode === "create"
      ? isEventForm
        ? "Create Event"
        : isAlertForm
          ? "Send Alert"
          : "Create Notice"
      : isEventForm
        ? "Update Event"
        : isAlertForm
          ? "Update Alert"
          : "Update Notice";

  const modalEyebrow =
    mode === "create"
      ? isEventForm
        ? "New event"
        : isAlertForm
          ? "New alert"
          : "New notice"
      : isEventForm
        ? "Edit event"
        : isAlertForm
          ? "Edit alert"
          : "Edit notice";

  return (
    <div className="nl-notice-modal-backdrop">
      <div className="nl-notice-modal" role="dialog" aria-modal="true" aria-labelledby="notice-modal-title">
        <header className="nl-notice-modal-head">
          <div className="min-w-0">
            <p className="nl-notice-modal-eyebrow">{modalEyebrow}</p>
            <h3 id="notice-modal-title" className="nl-notice-modal-title">
              {modalTitle}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="nl-notice-modal-close" aria-label="Close">
            <IcoX />
          </button>
        </header>

        <div ref={formRef} className="nl-notice-modal-body">
          <div className="nl-notice-form">
            <div className="nl-notice-field">
              <FieldLabel required>Title</FieldLabel>
              <input
                data-field="title"
                value={form.title}
                maxLength={200}
                onBlur={() => {
                  touch("title");
                  const next = runValidation(false);
                  setErrors((prev) => ({ ...prev, title: next.title }));
                }}
                onChange={(e) => set("title", e.target.value)}
                className={inputClass(showError("title") ? errors.title : undefined, "nl-input w-full")}
                placeholder="Community BBQ this Saturday"
              />
              {showError("title") && errors.title ? (
                <FieldError>{errors.title}</FieldError>
              ) : null}
            </div>

            <div className="nl-notice-field">
              <FieldLabel required>Description</FieldLabel>
              <textarea
                data-field="body"
                value={form.body}
                maxLength={5000}
                onBlur={() => {
                  touch("body");
                  const next = runValidation(false);
                  setErrors((prev) => ({ ...prev, body: next.body }));
                }}
                onChange={(e) => set("body", e.target.value)}
                rows={3}
                className={inputClass(showError("body") ? errors.body : undefined, "nl-input nl-notice-textarea w-full resize-none")}
                placeholder="Write the full notice details for residents…"
              />
              {showError("body") && errors.body ? (
                <FieldError>{errors.body}</FieldError>
              ) : null}
            </div>

            {!lockedCategory ? (
            <div className="nl-notice-field">
              <FieldLabel>Category</FieldLabel>
              <div className="nl-category-grid" role="listbox" aria-label="Notice category">
                {NOTICE_CATEGORIES.filter((c) => !["event", "emergency"].includes(c.value)).map((c) => {
                  const active = form.category === c.value;
                  const color = CAT_COLORS[c.value] ?? "#64748b";
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => set("category", c.value)}
                      className={[
                        "nl-category-chip",
                        active ? "nl-category-chip-active" : "",
                      ].join(" ")}
                      style={
                        active
                          ? {
                              borderColor: color,
                              background: `${color}12`,
                              boxShadow: `0 0 0 1px ${color}22`,
                            }
                          : undefined
                      }
                    >
                      <span
                        className="nl-category-chip-dot"
                        style={{
                          background: color,
                          boxShadow: active ? `0 0 0 3px ${color}22` : undefined,
                        }}
                      />
                      <span
                        className="nl-category-chip-label"
                        style={active ? { color } : undefined}
                      >
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            ) : null}

            {!isAlertForm ? (
            <div className="nl-notice-field">
              <FieldLabel required={isEventForm}>Location</FieldLabel>
              <div className="nl-notice-input-icon">
                <span className="nl-notice-input-icon-mark" aria-hidden>
                  <IcoPin />
                </span>
                <input
                  data-field="location"
                  value={form.location}
                  maxLength={255}
                  onBlur={() => {
                    touch("location");
                    const next = runValidation(false);
                    setErrors((prev) => ({ ...prev, location: next.location }));
                  }}
                  onChange={(e) => set("location", e.target.value)}
                  className={inputClass(showError("location") ? errors.location : undefined, "nl-input w-full nl-notice-input-with-icon")}
                  placeholder="Courtyard, Block A, Pool area…"
                />
              </div>
              {showError("location") && errors.location ? (
                <FieldError>{errors.location}</FieldError>
              ) : null}
            </div>
            ) : null}

            <section className="nl-notice-schedule">
              <div className="nl-notice-schedule-head">
                <div>
                  <p className="nl-notice-schedule-title">{scheduleTitle}</p>
                  <p className="nl-notice-schedule-hint">{scheduleHint}</p>
                </div>
                <div className="nl-notice-schedule-shortcuts">
                  <ScheduleShortcut
                    label="Today"
                    active={form.event_date === todayIso()}
                    onClick={() => set("event_date", todayIso())}
                  />
                  <ScheduleShortcut
                    label="Tomorrow"
                    active={form.event_date === tomorrowIso()}
                    onClick={() => set("event_date", tomorrowIso())}
                  />
                  <ScheduleShortcut
                    label="Clear"
                    muted
                    onClick={() => {
                      set("event_date", "");
                      set("event_time", "");
                      set("event_time_end", "");
                    }}
                  />
                </div>
              </div>

              {schedulePreview ? (
                <ScheduleSummary preview={schedulePreview} />
              ) : null}

              <div className="nl-notice-schedule-grid">
                <ThemedDatePicker
                  label={isAlertForm ? "Alert date" : isNoticeForm ? "Notice date" : "Event date"}
                  placeholder="Select date"
                  icon={<IcoCalendarSmall />}
                  value={form.event_date}
                  fieldKey="event_date"
                  error={showError("event_date") ? errors.event_date : undefined}
                  onBlur={() => {
                    touch("event_date");
                    const next = runValidation(false);
                    setErrors((prev) => ({ ...prev, event_date: next.event_date }));
                  }}
                  onChange={(v) => set("event_date", v)}
                />
                <ThemedTimePicker
                  label={isAlertForm ? "Start time (optional)" : isNoticeForm ? "Start time" : "Time from"}
                  placeholder={isAlertForm ? "Optional" : "Start time"}
                  icon={<IcoClock />}
                  value={form.event_time}
                  fieldKey="event_time"
                  onChange={(v) => {
                    set("event_time", v);
                    if (!isAlertForm && v && !form.event_time_end.trim()) {
                      set("event_time_end", addMinutesToTime(v, 60));
                    }
                    if (form.event_time_end.trim()) {
                      const next = runValidation(false);
                      setErrors((prev) => ({
                        ...prev,
                        event_time_end: next.event_time_end,
                      }));
                      if (next.event_time_end) touch("event_time_end");
                    }
                  }}
                  onBlur={() => {
                    touch("event_time");
                    const next = runValidation(false);
                    setErrors((prev) => ({
                      ...prev,
                      event_time: next.event_time,
                      event_time_end: next.event_time_end,
                    }));
                  }}
                />
                <ThemedTimePicker
                  label={isAlertForm ? "End time (optional)" : isNoticeForm ? "End time" : "Time to"}
                  placeholder={isAlertForm ? "Optional" : "End time"}
                  icon={<IcoClock />}
                  value={form.event_time_end}
                  fieldKey="event_time_end"
                  error={showError("event_time_end") ? errors.event_time_end : undefined}
                  onBlur={() => {
                    touch("event_time_end");
                    const next = runValidation(false);
                    setErrors((prev) => ({
                      ...prev,
                      event_time_end: next.event_time_end,
                      event_date: next.event_date,
                    }));
                  }}
                  onChange={(v) => set("event_time_end", v)}
                />
              </div>

              {showError("event_date") && errors.event_date ? (
                <FieldError>{errors.event_date}</FieldError>
              ) : null}
              {showError("event_time_end") && errors.event_time_end ? (
                <FieldError>{errors.event_time_end}</FieldError>
              ) : null}

              {isEventForm && form.event_time.trim() ? (
                <div className="nl-notice-duration-shortcuts">
                  <span className="nl-notice-duration-label">Duration</span>
                  {[1, 2, 3].map((hours) => (
                    <ScheduleShortcut
                      key={hours}
                      label={`${hours}h`}
                      onClick={() => applyDurationFromStart(hours)}
                    />
                  ))}
                </div>
              ) : null}

              {!schedulePreview ? (
                <p className="nl-notice-schedule-note">{scheduleOptionalNote}</p>
              ) : null}

              {(isEventForm || form.category === "event") ? (
                <div className="nl-notice-field nl-notice-field--compact">
                  <FieldLabel>Capacity</FieldLabel>
                  <input
                    data-field="event_capacity"
                    type="number"
                    min={1}
                    max={100000}
                    inputMode="numeric"
                    value={form.event_capacity}
                    onBlur={() => {
                      touch("event_capacity");
                      const next = runValidation(false);
                      setErrors((prev) => ({ ...prev, event_capacity: next.event_capacity }));
                    }}
                    onChange={(e) => set("event_capacity", e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Unlimited if empty"
                    className={inputClass(showError("event_capacity") && errors.event_capacity)}
                  />
                  <p className="nl-notice-schedule-note">
                    Maximum attendees who can join. Leave empty for no limit.
                  </p>
                  {showError("event_capacity") && errors.event_capacity ? (
                    <FieldError>{errors.event_capacity}</FieldError>
                  ) : null}
                </div>
              ) : null}
            </section>

            {(isEventForm || isNoticeForm || isAlertForm) ? (
              <section className="nl-notice-schedule">
                <div className="nl-notice-field">
                  <FieldLabel>
                    {isEventForm ? "Event options" : isAlertForm ? "Alert options" : "Notice options"}
                  </FieldLabel>
                  {isNoticeForm ? (
                    <NoticeAudienceField
                      audienceType={form.audience_type}
                      selectedIds={form.recipient_user_ids}
                      onAudienceTypeChange={(value) => {
                        set("audience_type", value);
                        if (value === "all") {
                          set("recipient_user_ids", []);
                          clearFieldError("recipient_user_ids");
                        }
                      }}
                      onSelectedIdsChange={(ids) => {
                        set("recipient_user_ids", ids);
                        clearFieldError("recipient_user_ids");
                      }}
                      error={errors.recipient_user_ids}
                      showError={showError("recipient_user_ids")}
                    />
                  ) : null}
                  {isEventForm ? (
                    <div className="nl-notice-option-row">
                      <div>
                        <p className="nl-notice-option-title">Require RSVP</p>
                        <p className="nl-notice-schedule-note">Track attendance for this event</p>
                      </div>
                      <FormToggle value={form.requires_rsvp} onChange={(v) => set("requires_rsvp", v)} />
                    </div>
                  ) : null}
                  {!isAlertForm ? (
                  <div className="nl-notice-option-row">
                    <div>
                      <p className="nl-notice-option-title">Pin to Top</p>
                      <p className="nl-notice-schedule-note">
                        {isEventForm
                          ? "Keep this event at the top until it expires"
                          : "Keep this notice at the top until it expires"}
                      </p>
                    </div>
                    <FormToggle value={form.is_pinned} onChange={(v) => set("is_pinned", v)} />
                  </div>
                  ) : null}
                  <div className="nl-notice-option-row">
                    <div>
                      <p className="nl-notice-option-title">Schedule for Later</p>
                      <p className="nl-notice-schedule-note">Publish at a specific date and time</p>
                    </div>
                    <FormToggle
                      value={form.schedule_later}
                      onChange={(v) => {
                        set("schedule_later", v);
                        if (!v) {
                          set("scheduled_at_date", "");
                          set("scheduled_at_time", "");
                          clearFieldError("scheduled_at_date");
                          clearFieldError("scheduled_at_time");
                        }
                      }}
                    />
                  </div>
                  {form.schedule_later ? (
                    <div className="nl-notice-schedule-grid">
                      <ThemedDatePicker
                        label="Publish date"
                        value={form.scheduled_at_date}
                        onChange={(v) => set("scheduled_at_date", v)}
                        icon={<IcoCalendarSmall />}
                        error={showError("scheduled_at_date") ? errors.scheduled_at_date : undefined}
                      />
                      <ThemedTimePicker
                        label="Publish time"
                        value={form.scheduled_at_time}
                        onChange={(v) => set("scheduled_at_time", v)}
                        icon={<IcoClock />}
                        error={showError("scheduled_at_time") ? errors.scheduled_at_time : undefined}
                      />
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div className="nl-notice-field">
              <FieldLabel>Cover image</FieldLabel>
              <div className="nl-notice-image">
                {preview ? (
                  <div className="nl-notice-image-preview">
                    <div className="nl-notice-image-banner">
                      <img src={preview} alt="Event cover preview" />
                    </div>
                    <div className="nl-notice-image-preview-foot">
                      <p className="nl-notice-image-caption">
                        Full image preview · 16:9 frames best on the event page
                      </p>
                      <div className="nl-notice-image-actions">
                        <button type="button" onClick={() => fileRef.current?.click()} className="nl-notice-image-btn">
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPreview(null);
                            setImageFile(null);
                            set("image_url", "");
                          }}
                          className="nl-notice-image-btn nl-notice-image-btn--muted"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="nl-notice-image-drop">
                    <span className="nl-notice-image-drop-icon">
                      <IcoImage />
                    </span>
                    <span className="nl-notice-image-drop-copy">
                      <span className="nl-notice-image-drop-title">Add cover image</span>
                      <span className="nl-notice-image-drop-sub">Optional · JPG or PNG, max 5MB</span>
                    </span>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImagePick(e.target.files?.[0] ?? null)} />
              </div>
            </div>

            {mode === "edit" ? (
              <div>
                <label className="nl-label">Status</label>
                <div className="mt-1.5">
                  <AdminBadge tone={NOTICE_STATUS_META[form.status]?.tone ?? "slate"}>
                    {NOTICE_STATUS_META[form.status]?.label ?? form.status}
                  </AdminBadge>
                </div>
              </div>
            ) : null}

            {localError ? (
              <div className="nl-notice-error">{localError}</div>
            ) : null}
          </div>
        </div>

        <footer className="nl-notice-modal-foot">
          <button type="button" onClick={onClose} disabled={busy} className="nl-btn-ghost">
            Cancel
          </button>
          <div className="nl-notice-modal-foot-actions">
            <button type="button" disabled={busy} onClick={() => handleSubmit(false, "draft")} className="nl-btn-secondary disabled:opacity-60">
              {busy ? "Saving…" : "Save draft"}
            </button>
            <button type="button" disabled={busy || !canPublishNow} onClick={() => handleSubmit(true)} className="nl-btn-primary disabled:opacity-60">
              <IcoSend />
              {busy
                ? "Publishing…"
                : mode === "create"
                  ? (isEventForm || isNoticeForm || isAlertForm) && form.schedule_later
                    ? "Schedule"
                    : "Publish now"
                  : "Save & publish"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ScheduleSummary({ preview }: { preview: SchedulePreview }) {
  return (
    <div className="nl-notice-schedule-summary">
      <div className="nl-notice-schedule-summary-main">
        <IcoClock />
        <span>{preview.headline}</span>
      </div>
      {(preview.duration || preview.overnight) && (
        <div className="nl-notice-schedule-summary-meta">
          {preview.duration ? (
            <span className="nl-notice-schedule-pill">{preview.duration}</span>
          ) : null}
          {preview.overnight ? (
            <span className="nl-notice-schedule-pill nl-notice-schedule-pill--overnight">
              Ends next day
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="nl-notice-label">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return <p className="nl-notice-field-error">{children}</p>;
}

function FormToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className={`flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 ${value ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-slate-200"}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${value ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function ScheduleShortcut({
  label,
  onClick,
  active = false,
  muted = false,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "nl-schedule-chip",
        active ? "nl-schedule-chip--active" : "",
        muted ? "nl-schedule-chip--muted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </button>
  );
}

function IcoX() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IcoSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M14 2L9 14l-2-5-5-2L14 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IcoImage() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="text-slate-500">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IcoCalendarSmall() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcoClock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
