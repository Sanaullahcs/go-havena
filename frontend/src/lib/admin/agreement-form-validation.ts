import type { FieldErrors } from "@/lib/admin/form-validation-utils";
import { validateTitleAndDescription } from "@/lib/admin/document-form-validation";

type CalendarDate = { year: number; month: number; day: number };

/** Read a calendar day from `YYYY-MM-DD` or `MM/DD/YYYY`, ignoring any clock time. */
export function parseAgreementDate(value: string | null | undefined): CalendarDate | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(trimmed);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const year = iso ? Number(iso[1]) : us ? Number(us[3]) : NaN;
  const month = iso ? Number(iso[2]) : us ? Number(us[1]) : NaN;
  const day = iso ? Number(iso[3]) : us ? Number(us[2]) : NaN;
  if (!iso && !us) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000) return null;

  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return { year, month, day };
}

/** `YYYY-MM-DD` for a date input. Empty when the value is not a real calendar day. */
export function agreementDateKey(value: string | null | undefined): string {
  const parsed = parseAgreementDate(value);
  if (!parsed) return "";
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

/** Today's calendar date in a timezone. Falls back to the browser's local date. */
export function calendarToday(timeZone?: string, now: Date = new Date()): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
      const year = get("year");
      const month = get("month");
      const day = get("day");
      if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month) && /^\d{2}$/.test(day)) {
        return `${year}-${month}-${day}`;
      }
    } catch {
      // An unknown timezone uses the browser's local calendar below.
    }
  }

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function requiredDate(value: string, label: string, today: string): string | null {
  if (!value.trim()) return `${label} is required.`;
  const key = agreementDateKey(value);
  if (!key) return `Enter a valid ${label.toLowerCase()}.`;
  if (key < today) return `${label} cannot be in the past.`;
  return null;
}

export function validateAgreementDetails(
  form: {
    title: string;
    description?: string;
    category: string;
    dueAt: string;
    effectiveAt: string;
    expiresAt: string;
    hasFile: boolean;
  },
  options?: { timeZone?: string; now?: Date },
): FieldErrors {
  const errors: FieldErrors = validateTitleAndDescription(form.title, form.description ?? "");
  const today = calendarToday(options?.timeZone, options?.now);
  const category = form.category.trim();

  if (!category) errors.category = "Category is required.";
  else if (category.length > 100) errors.category = "Category must be 100 characters or less.";

  const dueError = requiredDate(form.dueAt, "Due date", today);
  if (dueError) errors.dueAt = dueError;

  const effectiveError = requiredDate(form.effectiveAt, "Effective date", today);
  if (effectiveError) errors.effectiveAt = effectiveError;

  const expiresError = requiredDate(form.expiresAt, "Expiration date", today);
  if (expiresError) errors.expiresAt = expiresError;
  else {
    const expiresKey = agreementDateKey(form.expiresAt);
    const effectiveKey = agreementDateKey(form.effectiveAt);
    const dueKey = agreementDateKey(form.dueAt);
    if (effectiveKey && expiresKey < effectiveKey) {
      errors.expiresAt = "Expiration date must be on or after the effective date.";
    } else if (dueKey && expiresKey < dueKey) {
      errors.expiresAt = "Expiration date must be on or after the due date.";
    }
  }

  if (!form.hasFile) errors.file = "Choose a PDF to upload.";

  return errors;
}
