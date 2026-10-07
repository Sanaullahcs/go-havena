"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { ThemedDatePicker } from "@/components/ui/themed-date-picker";
import { ThemedSelect } from "@/components/ui/themed-select";
import { confirmAction } from "@/lib/alert";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";
import { SERVICE_CATEGORY_OPTIONS, type PropertyServiceForm } from "@/lib/api/property-services";

export const NOTICE_TITLE_TEMPLATE = "{{service}} — Unit {{unit}}";
const NOTICE_PREVIEW_UNIT = "201";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function billingYearValue(value?: string | null) {
  const year = String(value ?? "").slice(0, 4);
  return /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
}

function billingMonthValue(value?: string | null) {
  const month = String(value ?? "").slice(5, 7);
  return /^\d{2}$/.test(month) ? month : String(new Date().getMonth() + 1).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function billingDateIso(form: Pick<PropertyServiceForm, "first_billing_month" | "due_day">) {
  const year = Number(billingYearValue(form.first_billing_month));
  const month = Number(billingMonthValue(form.first_billing_month));
  const maxDay = daysInMonth(year, month);
  const day = Math.min(maxDay, Math.max(1, Number(form.due_day || 1)));
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function applyBillingDate(form: PropertyServiceForm, iso: string): PropertyServiceForm {
  if (!iso) return { ...form, first_billing_month: null, due_day: null };
  const [year, month, day] = iso.split("-");
  return {
    ...form,
    first_billing_month: year && month ? `${year}-${month}` : form.first_billing_month,
    due_day: day ? Number(day) : form.due_day,
  };
}

function applyDueMonth(form: PropertyServiceForm, iso: string): PropertyServiceForm {
  const year = billingYearValue(form.first_billing_month);
  const month = iso.slice(5, 7) || billingMonthValue(iso);
  return { ...form, first_billing_month: `${year}-${month}` };
}

function isNoticeTemplate(value?: string | null) {
  return !value?.trim() || /\{\{\s*(service|unit|month|amount)\s*\}\}/i.test(value);
}

function fillNoticePreview(template: string, serviceName: string, unitNumber = NOTICE_PREVIEW_UNIT) {
  const name = serviceName.trim() || "Service";
  return template
    .replace(/\{\{\s*service\s*\}\}/gi, name)
    .replace(/\{\{\s*unit\s*\}\}/gi, unitNumber)
    .replace(/\{\{\s*month\s*\}\}/gi, "September 2026")
    .replace(/\{\{\s*amount\s*\}\}/gi, "$50");
}

function noticeTitleDisplay(form: PropertyServiceForm) {
  const template = form.notice_title?.trim() || NOTICE_TITLE_TEMPLATE;
  return fillNoticePreview(template, form.name);
}

function defaultNoticeBodyTemplate(form: PropertyServiceForm) {
  return `Your ${form.name.trim() || "service"} bill is now available for unit {{unit}}.`;
}

function noticeBodyDisplay(form: PropertyServiceForm) {
  const template = form.notice_body?.trim() || defaultNoticeBodyTemplate(form);
  return fillNoticePreview(template, form.name);
}

export function noticeFieldsForSave(form: PropertyServiceForm): Pick<PropertyServiceForm, "notice_title" | "notice_body"> {
  const currentTitle = form.notice_title?.trim() || NOTICE_TITLE_TEMPLATE;
  const defaultTitlePreview = fillNoticePreview(NOTICE_TITLE_TEMPLATE, form.name);
  const noticeTitle = isNoticeTemplate(currentTitle) || currentTitle === defaultTitlePreview
    ? NOTICE_TITLE_TEMPLATE
    : currentTitle.replaceAll(NOTICE_PREVIEW_UNIT, "{{unit}}");

  const currentBody = form.notice_body?.trim() || "";
  const defaultBodyPreview = fillNoticePreview(defaultNoticeBodyTemplate(form), form.name);
  const noticeBody = !currentBody || isNoticeTemplate(currentBody) || currentBody === defaultBodyPreview
    ? ""
    : currentBody.replaceAll(NOTICE_PREVIEW_UNIT, "{{unit}}");

  return { notice_title: noticeTitle, notice_body: noticeBody };
}

const STEPS = [1, 2, 3, 4] as const;
const STEP_COPY = {
  1: { label: "Details", title: "Service details" },
  2: { label: "Billing", title: "Billing setup" },
  3: { label: "Notices", title: "Notices & proof" },
  4: { label: "Review", title: "Review & save" },
} as const;

type Touched = Record<string, boolean>;

function RequiredMark() {
  return <span className="text-red-500"> *</span>;
}

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
      {children}
      {required ? <RequiredMark /> : null}
    </label>
  );
}

const SERVICE_FIELD_MAX = {
  name: 120,
  custom_category: 80,
  description: 500,
  payment_instructions: 2000,
  notice_title: 200,
  notice_body: 4000,
} as const;

function FieldMeta({ error, value, max }: { error?: string; value?: string; max?: number }) {
  const text = value ?? "";
  const showCounter = max != null && text.length > 0;
  if (!error && !showCounter) return null;
  return (
    <div className="mt-1 flex items-start justify-end gap-2">
      {error ? <p className="mr-auto text-xs text-red-600">{error}</p> : <span className="mr-auto" />}
      {showCounter ? (
        <p className={`shrink-0 text-[11px] tabular-nums ${text.length > max ? "text-red-600" : "text-slate-400"}`}>
          {text.length}/{max}
        </p>
      ) : null}
    </div>
  );
}

const SERVICE_AMOUNT_MAX = 999999.99;
const SERVICE_SUBSCRIBER_MIN = 1;
const SERVICE_SUBSCRIBER_MAX = 100000;

function sanitizeSubscriberInput(raw: string): number | string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (/^0+$/.test(digits)) return 0;
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  if (trimmed.length > 6) return trimmed;
  return Number(trimmed);
}

function serviceSubscriberError(value: PropertyServiceForm["max_subscribers"]): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return "Enter at least 1 subscriber.";
  const numeric = Number(raw);
  if (!Number.isSafeInteger(numeric) || numeric < SERVICE_SUBSCRIBER_MIN) return "Enter at least 1 subscriber.";
  if (numeric > SERVICE_SUBSCRIBER_MAX) return "Enter 100,000 subscribers or fewer.";
  return undefined;
}

function sanitizeServiceAmountInput(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  let whole = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, "");
  if (!whole) whole = "0";
  if (whole.length > 6) return "999999.99";
  const fraction = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  const next = fraction === null ? whole : `${whole}.${fraction}`;
  const numeric = Number(next.endsWith(".") ? next.slice(0, -1) : next);
  if (Number.isFinite(numeric) && numeric > SERVICE_AMOUNT_MAX) return "999999.99";
  return next;
}

function serviceAmountError(value: PropertyServiceForm["amount"]): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw || raw === ".") return "Enter an amount of at least 0.01.";
  const fraction = raw.split(".")[1] ?? "";
  if (fraction.length > 2) return "Enter an amount with up to 2 decimal places.";
  const numeric = Number(raw.endsWith(".") ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(numeric) || numeric < 0.01) return "Enter an amount of at least 0.01.";
  if (numeric > SERVICE_AMOUNT_MAX) return "Enter an amount of 999,999.99 or less.";
  return undefined;
}

function validateServiceForm(form: PropertyServiceForm, step: number): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.name.length > SERVICE_FIELD_MAX.name) errors.name = "Service name must be 120 characters or fewer.";
  if (String(form.custom_category ?? "").length > SERVICE_FIELD_MAX.custom_category) {
    errors.custom_category = "Custom category must be 80 characters or fewer.";
  }
  if (String(form.description ?? "").length > SERVICE_FIELD_MAX.description) {
    errors.description = "Description must be 500 characters or fewer.";
  }
  if (String(form.payment_instructions ?? "").length > SERVICE_FIELD_MAX.payment_instructions) {
    errors.payment_instructions = "Payment instructions must be 2,000 characters or fewer.";
  }
  if (!isNoticeTemplate(form.notice_title) && String(form.notice_title ?? "").length > SERVICE_FIELD_MAX.notice_title) {
    errors.notice_title = "Notice title must be 200 characters or fewer.";
  }
  if (!isNoticeTemplate(form.notice_body) && String(form.notice_body ?? "").length > SERVICE_FIELD_MAX.notice_body) {
    errors.notice_body = "Notice body must be 4,000 characters or fewer.";
  }

  if (step >= 1) {
    if (!errors.name) {
      if (!form.name.trim()) errors.name = "Service name is required.";
      else if (form.name.trim().length < 2) errors.name = "Service name must be at least 2 characters.";
    }
    if (!form.category) errors.category = "Category is required.";
    else if (!errors.custom_category && form.category === "other" && String(form.custom_category ?? "").trim().length < 2) {
      errors.custom_category = "Custom category must be at least 2 characters.";
    }
  }
  if (step >= 2) {
    if (!form.application_type) errors.application_type = "Application type is required.";
    if (!form.billing_frequency) errors.billing_frequency = "Choose monthly or yearly billing.";
    if (form.application_type === "automatic" && form.billing_frequency === "one_time") {
      errors.billing_frequency = "Automatic services must bill monthly or yearly.";
    }
    const amountError = serviceAmountError(form.amount);
    if (amountError) errors.amount = amountError;
    if (form.application_type === "optional") {
      const subscriberError = serviceSubscriberError(form.max_subscribers);
      if (subscriberError) errors.max_subscribers = subscriberError;
    }
    const recurring = form.billing_frequency === "monthly" || form.billing_frequency === "yearly";
    if (recurring) {
      const dueDay = Number(form.due_day || 0);
      if (!form.due_day || dueDay < 1 || dueDay > 31) errors.due_day = "Choose a due date.";
    }
    if ((form.application_type === "automatic" || form.billing_frequency === "yearly") && !form.first_billing_month) {
      errors.first_billing_month = form.billing_frequency === "yearly"
        ? "Choose the billing year."
        : "Choose the first billing month.";
    }
  }
  return errors;
}

export function PropertyServiceFormModal({
  editing,
  form,
  setForm,
  step,
  setStep,
  saving,
  onClose,
  onSubmit,
}: {
  editing: boolean;
  form: PropertyServiceForm;
  setForm: (form: PropertyServiceForm) => void;
  step: number;
  setStep: (step: number) => void;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const [touched, setTouched] = useState<Touched>({});
  const [reviewed, setReviewed] = useState(false);
  const liveErrors = useMemo(() => validateServiceForm(form, step), [form, step]);
  const fieldError = (key: string, value?: string, max?: number) => {
    const message = liveErrors[key];
    if (!message) return undefined;
    if (max != null && String(value ?? "").length > max) return message;
    return touched[key] ? message : undefined;
  };

  useEffect(() => {
    if (step !== 4) setReviewed(false);
  }, [step]);

  function touch(key: string) {
    setTouched((current) => ({ ...current, [key]: true }));
  }

  function setField<K extends keyof PropertyServiceForm>(key: K, value: PropertyServiceForm[K]) {
    setForm({ ...form, [key]: value });
    touch(key);
  }

  function goNext() {
    const stepKeys = step === 1
      ? ["name", "category", "custom_category", "description"]
      : step === 3
        ? ["notice_title", "notice_body"]
        : ["application_type", "billing_frequency", "amount", "due_day", "first_billing_month", "due_month", "payment_instructions", "max_subscribers"];
    setTouched((current) => ({
      ...current,
      ...Object.fromEntries(stepKeys.map((key) => [key, true])),
    }));
    if (hasFieldErrors(validateServiceForm(form, step))) return;
    setReviewed(false);
    setStep(step + 1);
  }

  async function requestPublish() {
    if (step !== 4 || !reviewed || saving) return;
    if (hasFieldErrors(validateServiceForm(form, 4))) {
      setTouched((current) => ({
        ...current,
        name: true,
        category: true,
        custom_category: true,
        application_type: true,
        billing_frequency: true,
        amount: true,
        due_day: true,
        first_billing_month: true,
        due_month: true,
        max_subscribers: true,
      }));
      return;
    }

    const result = await confirmAction({
      title: editing ? "Save these changes?" : "Publish this service?",
      text: editing
        ? "Confirm the reviewed details before updating this service."
        : "Publishing this service will notify the unit billing contacts. Notifications will only be sent after you confirm.",
      confirmText: editing ? "Save" : "Publish",
      color: "green",
    });
    if (!result.isConfirmed) return;

    const event = { preventDefault() {} } as FormEvent;
    onSubmit(event);
  }

  const recurring = form.billing_frequency === "monthly" || form.billing_frequency === "yearly";
  const yearly = form.billing_frequency === "yearly";
  const selectedBillingDate = billingDateIso(form);
  const frequencyOptions = form.application_type === "automatic"
    ? [
        { value: "monthly", label: "Per month" },
        { value: "yearly", label: "Per year" },
      ]
    : [
        { value: "monthly", label: "Per month" },
        { value: "yearly", label: "Per year" },
        { value: "one_time", label: "One-time" },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <form
        onSubmit={(event) => {
          event.preventDefault();
        }}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Step {step} of 4
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                {editing ? "Update service" : "Create service"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ol className="mt-3 flex flex-wrap items-center gap-1.5">
            {STEPS.map((item, index) => {
              const active = item === step;
              const done = item < step;
              return (
                <li key={item} className="flex items-center gap-1.5">
                  {index > 0 ? <span className="text-[11px] text-slate-300">→</span> : null}
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold",
                      active ? "bg-[#1B4F8A] text-white" : done ? "bg-[#E8F0F7] text-[#1B4F8A]" : "bg-slate-100 text-slate-500",
                    ].join(" ")}
                  >
                    {STEP_COPY[item].label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm font-semibold text-slate-900">{STEP_COPY[step as 1 | 2 | 3 | 4].title}</p>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <FieldLabel required>Service name</FieldLabel>
                <input
                  className={inputClass(fieldError("name", form.name, SERVICE_FIELD_MAX.name))}
                  value={form.name}
                  maxLength={SERVICE_FIELD_MAX.name}
                  onChange={(e) => setField("name", e.target.value.slice(0, SERVICE_FIELD_MAX.name))}
                  onFocus={() => touch("name")}
                  onBlur={() => touch("name")}
                  placeholder="e.g. Parking dues"
                />
                <FieldMeta
                  error={fieldError("name", form.name, SERVICE_FIELD_MAX.name)}
                  value={form.name}
                  max={SERVICE_FIELD_MAX.name}
                />
              </div>
              <div>
                <FieldLabel required>Category</FieldLabel>
                <ThemedSelect
                  value={form.category}
                  options={SERVICE_CATEGORY_OPTIONS}
                  onChange={(value) => {
                    const next = value as PropertyServiceForm["category"];
                    setForm({
                      ...form,
                      category: next,
                      custom_category: next === "other" ? (form.custom_category ?? "") : "",
                    });
                    touch("category");
                  }}
                  onFocus={() => touch("category")}
                  onBlur={() => touch("category")}
                  error={fieldError("category") ? liveErrors.category : undefined}
                />
                {fieldError("category") ? <p className="mt-1 text-xs text-red-600">{liveErrors.category}</p> : null}
              </div>
              {form.category === "other" ? (
                <div>
                  <FieldLabel required>Custom category</FieldLabel>
                  <input
                    className={inputClass(fieldError("custom_category", form.custom_category ?? "", SERVICE_FIELD_MAX.custom_category))}
                    value={form.custom_category ?? ""}
                    maxLength={SERVICE_FIELD_MAX.custom_category}
                    onChange={(e) => setField("custom_category", e.target.value.slice(0, SERVICE_FIELD_MAX.custom_category))}
                    onFocus={() => touch("custom_category")}
                    onBlur={() => touch("custom_category")}
                    placeholder="e.g. Concierge"
                  />
                  <FieldMeta
                    error={fieldError("custom_category", form.custom_category ?? "", SERVICE_FIELD_MAX.custom_category)}
                    value={form.custom_category ?? ""}
                    max={SERVICE_FIELD_MAX.custom_category}
                  />
                </div>
              ) : null}
              <div>
                <FieldLabel>Status</FieldLabel>
                <ThemedSelect
                  value={form.status ?? "active"}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                  onChange={(value) => setField("status", value as PropertyServiceForm["status"])}
                />
              </div>
              <div>
                <FieldLabel>Description</FieldLabel>
                <textarea
                  className={`${inputClass(fieldError("description", form.description, SERVICE_FIELD_MAX.description))} h-[88px] min-h-[88px] max-h-[88px] resize-none overflow-y-auto`}
                  value={form.description}
                  maxLength={SERVICE_FIELD_MAX.description}
                  onChange={(e) => setField("description", e.target.value.slice(0, SERVICE_FIELD_MAX.description))}
                  placeholder="Optional details for residents"
                />
                <FieldMeta
                  error={fieldError("description", form.description, SERVICE_FIELD_MAX.description)}
                  value={form.description}
                  max={SERVICE_FIELD_MAX.description}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <FieldLabel required>Application type</FieldLabel>
                <ThemedSelect
                  value={form.application_type}
                  options={[
                    { value: "automatic", label: "Automatic (all units)" },
                    { value: "optional", label: "Optional (resident opt-in)" },
                  ]}
                  onChange={(value) => {
                    const nextType = value as PropertyServiceForm["application_type"];
                    setForm({
                      ...form,
                      application_type: nextType,
                      billing_frequency: nextType === "automatic" && form.billing_frequency === "one_time"
                        ? "monthly"
                        : form.billing_frequency,
                      amount_type: nextType === "optional" ? "fixed" : form.amount_type,
                      auto_generate_bills: form.billing_frequency !== "one_time",
                    });
                    touch("application_type");
                  }}
                  onFocus={() => touch("application_type")}
                  onBlur={() => touch("application_type")}
                  error={fieldError("application_type") ? liveErrors.application_type : undefined}
                />
              </div>
              <div>
                <FieldLabel required>Billing cycle</FieldLabel>
                <ThemedSelect
                  value={form.billing_frequency ?? "monthly"}
                  options={frequencyOptions}
                  onChange={(value) => {
                    const nextFrequency = value as PropertyServiceForm["billing_frequency"];
                    const year = billingYearValue(form.first_billing_month);
                    const month = billingMonthValue(form.first_billing_month);
                    setForm({
                      ...form,
                      billing_frequency: nextFrequency,
                      auto_generate_bills: nextFrequency !== "one_time",
                      first_billing_month: nextFrequency === "one_time" ? form.first_billing_month : `${year}-${month}`,
                    });
                    touch("billing_frequency");
                  }}
                  onFocus={() => touch("billing_frequency")}
                  onBlur={() => touch("billing_frequency")}
                  error={fieldError("billing_frequency") ? liveErrors.billing_frequency : undefined}
                />
                {fieldError("billing_frequency") ? <p className="mt-1 text-xs text-red-600">{liveErrors.billing_frequency}</p> : null}
              </div>
              {form.application_type === "automatic" ? (
                <div>
                  <FieldLabel required>Amount type</FieldLabel>
                  <ThemedSelect
                    value={form.amount_type ?? "fixed"}
                    options={[
                      { value: "fixed", label: "Fixed per unit" },
                      { value: "variable", label: "Variable each cycle" },
                    ]}
                    onChange={(value) => setField("amount_type", value as PropertyServiceForm["amount_type"])}
                  />
                </div>
              ) : null}
              <div>
                <FieldLabel required>Amount</FieldLabel>
                <ClearableInput
                  type="text"
                  inputMode="decimal"
                  className={inputClass(fieldError("amount") ? liveErrors.amount : undefined)}
                  value={form.amount ?? ""}
                  onChange={(e) => setField("amount", sanitizeServiceAmountInput(e.target.value))}
                  onFocus={() => touch("amount")}
                  onBlur={() => touch("amount")}
                  placeholder="e.g. 200"
                />
                {fieldError("amount") ? (
                  <p className="mt-1 text-xs text-red-600">{liveErrors.amount}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    Changing this amount applies from the next billing cycle. Existing bills stay the same.
                  </p>
                )}
              </div>
              {yearly ? (
                <div>
                  <ThemedDatePicker
                    mode="month"
                    label="Due date *"
                    value={`${billingYearValue(form.first_billing_month)}-${billingMonthValue(form.first_billing_month)}-01`}
                    onChange={(iso) => {
                      setForm(applyDueMonth(form, iso));
                      touch("first_billing_month");
                    }}
                    onBlur={() => touch("first_billing_month")}
                    placeholder="Select due date month"
                    error={fieldError("first_billing_month") ? liveErrors.first_billing_month : undefined}
                  />
                  {fieldError("first_billing_month") ? (
                    <p className="mt-1 text-xs text-red-600">{liveErrors.first_billing_month}</p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Bills generate automatically once a year in this month.
                    </p>
                  )}
                </div>
              ) : recurring ? (
                <div>
                  <ThemedDatePicker
                    mode="date"
                    label="Due date *"
                    value={selectedBillingDate}
                    onChange={(iso) => {
                      setForm(applyBillingDate(form, iso));
                      touch("first_billing_month");
                      touch("due_day");
                    }}
                    onBlur={() => touch("first_billing_month")}
                    placeholder="Select due date"
                    error={fieldError("first_billing_month") || fieldError("due_day") ? liveErrors.first_billing_month || liveErrors.due_day : undefined}
                  />
                  {fieldError("first_billing_month") || fieldError("due_day") ? (
                    <p className="mt-1 text-xs text-red-600">{liveErrors.first_billing_month || liveErrors.due_day}</p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Bills generate automatically every month from this date.
                    </p>
                  )}
                </div>
              ) : null}
              {form.application_type === "optional" ? (
                <>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <ClearableInput
                      type="checkbox"
                      checked={!!form.requires_admin_approval}
                      onChange={(e) => setField("requires_admin_approval", e.target.checked)}
                    />
                    Requires admin approval
                  </label>
                  <div>
                    <FieldLabel>Max subscribers</FieldLabel>
                    <ClearableInput
                      type="text"
                      inputMode="numeric"
                      className={`${inputClass()} ${fieldError("max_subscribers") ? "!border-red-300 !ring-1 !ring-red-100" : ""}`}
                      value={form.max_subscribers ?? ""}
                      onChange={(e) => setField("max_subscribers", sanitizeSubscriberInput(e.target.value))}
                      onBlur={() => touch("max_subscribers")}
                      placeholder="Optional"
                    />
                    {fieldError("max_subscribers") ? (
                      <p className="mt-1 text-xs text-red-600">{liveErrors.max_subscribers}</p>
                    ) : null}
                  </div>
                </>
              ) : null}
              <div>
                <FieldLabel>Payment instructions</FieldLabel>
                <textarea
                  className={`${inputClass(fieldError("payment_instructions", form.payment_instructions, SERVICE_FIELD_MAX.payment_instructions))} h-[88px] min-h-[88px] max-h-[88px] resize-none overflow-y-auto`}
                  value={form.payment_instructions}
                  maxLength={SERVICE_FIELD_MAX.payment_instructions}
                  onChange={(e) => setField("payment_instructions", e.target.value.slice(0, SERVICE_FIELD_MAX.payment_instructions))}
                  placeholder="How residents should pay"
                />
                <FieldMeta
                  error={fieldError("payment_instructions", form.payment_instructions, SERVICE_FIELD_MAX.payment_instructions)}
                  value={form.payment_instructions}
                  max={SERVICE_FIELD_MAX.payment_instructions}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <FieldLabel>Notice title</FieldLabel>
                <input
                  className={inputClass(fieldError("notice_title", form.notice_title ?? "", SERVICE_FIELD_MAX.notice_title))}
                  value={isNoticeTemplate(form.notice_title) ? noticeTitleDisplay(form) : (form.notice_title ?? "")}
                  maxLength={SERVICE_FIELD_MAX.notice_title}
                  onChange={(e) => setField("notice_title", e.target.value.slice(0, SERVICE_FIELD_MAX.notice_title))}
                  placeholder={`${form.name.trim() || "Service"} — Unit ${NOTICE_PREVIEW_UNIT}`}
                />
                <FieldMeta
                  error={fieldError("notice_title", form.notice_title ?? "", SERVICE_FIELD_MAX.notice_title)}
                  value={isNoticeTemplate(form.notice_title) ? "" : (form.notice_title ?? "")}
                  max={SERVICE_FIELD_MAX.notice_title}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Each billed unit gets this notice with its own unit number. Preview uses unit {NOTICE_PREVIEW_UNIT}.
                </p>
              </div>
              <div>
                <FieldLabel>Notice body</FieldLabel>
                <textarea
                  className={`${inputClass(fieldError("notice_body", form.notice_body ?? "", SERVICE_FIELD_MAX.notice_body))} h-[88px] min-h-[88px] max-h-[88px] resize-none overflow-y-auto`}
                  value={isNoticeTemplate(form.notice_body) ? noticeBodyDisplay(form) : (form.notice_body ?? "")}
                  maxLength={SERVICE_FIELD_MAX.notice_body}
                  onChange={(e) => setField("notice_body", e.target.value.slice(0, SERVICE_FIELD_MAX.notice_body))}
                  placeholder="Shown on the resident Home notice."
                />
                <FieldMeta
                  error={fieldError("notice_body", form.notice_body ?? "", SERVICE_FIELD_MAX.notice_body)}
                  value={isNoticeTemplate(form.notice_body) ? "" : (form.notice_body ?? "")}
                  max={SERVICE_FIELD_MAX.notice_body}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <ClearableInput type="checkbox" checked={!!form.send_notice} onChange={(e) => setField("send_notice", e.target.checked)} />
                Send as notice
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <ClearableInput type="checkbox" checked={!!form.send_notification} onChange={(e) => setField("send_notification", e.target.checked)} />
                Send push notification
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <ClearableInput type="checkbox" checked={!!form.require_acknowledgement} onChange={(e) => setField("require_acknowledgement", e.target.checked)} />
                Require acknowledgement
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <ClearableInput type="checkbox" checked={!!form.require_payment_proof} onChange={(e) => setField("require_payment_proof", e.target.checked)} />
                Require payment proof
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2">
              <ReviewRow label="Service" value={`${form.name || "—"} · ${form.application_type}`} />
              <ReviewRow
                label="Category"
                value={
                  form.category === "other" && String(form.custom_category ?? "").trim()
                    ? `Other · ${String(form.custom_category).trim()}`
                    : (SERVICE_CATEGORY_OPTIONS.find((item) => item.value === form.category)?.label ?? form.category ?? "—")
                }
              />
              <ReviewRow
                label="Billing"
                value={
                  form.billing_frequency === "yearly"
                    ? "Per year"
                    : form.billing_frequency === "one_time"
                      ? "One-time"
                      : "Per month"
                }
              />
              <ReviewRow
                label="Amount"
                value={form.amount_type === "variable" ? "Entered when bills are generated" : `$${form.amount || 0}`}
              />
              <ReviewRow label="Status" value={form.status === "inactive" ? "Inactive" : "Active"} />
              <ReviewRow label="Notice title" value={noticeTitleDisplay(form)} />
              <p className="pt-1 text-sm text-slate-500">
                Billed to the unit billing contact. Residents of the same unit are not notified.
              </p>
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                <ClearableInput
                  type="checkbox"
                  className="mt-0.5"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                <span>
                  I have reviewed these details
                  {editing ? " and want to save the changes." : ". Do not publish until this is confirmed."}
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            className="text-sm font-semibold text-slate-500"
            onClick={() => { if (step === 1) onClose(); else setStep(step - 1); }}
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 4 ? (
            <button type="button" className="nl-btn-primary" onClick={goNext}>
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || !reviewed}
              onClick={() => void requestPublish()}
              className="nl-btn-primary disabled:opacity-50"
            >
              {editing ? "Update" : "Publish service"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
