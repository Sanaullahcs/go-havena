"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import {
  BILL_FILE_ACCEPT,
  currentBillingMonth,
  defaultBillTitle,
  defaultDueDate,
  validateAmenityBillForm,
} from "@/lib/admin/amenity-bill-validation";
import { inputClass } from "@/lib/admin/form-validation-utils";
import type { Amenity, AmenityMonthlyBillForm } from "@/lib/api/amenities";

function emptyForm(amenity: Amenity): AmenityMonthlyBillForm {
  const billingMonth = currentBillingMonth();
  return {
    billing_month: billingMonth,
    title: defaultBillTitle(amenity.name, billingMonth),
    description: "",
    amount_per_resident:
      amenity.shared_billing_amount != null ? String(amenity.shared_billing_amount) : "",
    due_date: defaultDueDate(billingMonth, amenity.shared_billing_due_day),
    file: null,
  };
}

export function AmenityMonthlyBillModal({
  amenity,
  submitting,
  onClose,
  onSubmit,
}: {
  amenity: Amenity;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: AmenityMonthlyBillForm) => void | Promise<void>;
}) {
  const [form, setForm] = useState<AmenityMonthlyBillForm>(() => emptyForm(amenity));
  const liveErrors = useMemo(() => validateAmenityBillForm(form), [form]);
  const { showError, touch, resetTouched, validateOnSubmit } = useTouchedFieldErrors();

  useEffect(() => {
    setForm(emptyForm(amenity));
    resetTouched();
  }, [amenity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = <K extends keyof AmenityMonthlyBillForm>(key: K, value: AmenityMonthlyBillForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleMonthChange = (billingMonth: string) => {
    setForm((prev) => {
      const previousDefault = defaultBillTitle(amenity.name, prev.billing_month);
      const nextTitle = prev.title.trim() === "" || prev.title === previousDefault
        ? defaultBillTitle(amenity.name, billingMonth)
        : prev.title;
      return {
        ...prev,
        billing_month: billingMonth,
        title: nextTitle,
        due_date: defaultDueDate(billingMonth, amenity.shared_billing_due_day) || prev.due_date,
      };
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateOnSubmit(liveErrors)) return;
    void onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Create monthly bill</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Publish one shared charge for every resident in {amenity.community_name || "this community"}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Amenity / Community</p>
            <p className="mt-0.5 font-semibold text-slate-900">{amenity.name}</p>
            <p className="text-xs text-slate-500">{amenity.community_name || "Current community"}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Billing month *</label>
              <ClearableInput
                type="month"
                className={inputClass(showError("billing_month", liveErrors.billing_month))}
                value={form.billing_month}
                onChange={(e) => handleMonthChange(e.target.value)}
                onBlur={() => touch("billing_month")}
              />
              {showError("billing_month", liveErrors.billing_month) ? (
                <p className="mt-1 text-xs text-red-600">{liveErrors.billing_month}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Due date *</label>
              <ClearableInput
                type="date"
                className={inputClass(showError("due_date", liveErrors.due_date))}
                value={form.due_date}
                onChange={(e) => setField("due_date", e.target.value)}
                onBlur={() => touch("due_date")}
              />
              {showError("due_date", liveErrors.due_date) ? (
                <p className="mt-1 text-xs text-red-600">{liveErrors.due_date}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Bill title *</label>
            <ClearableInput
              className={inputClass(showError("title", liveErrors.title))}
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              onBlur={() => touch("title")}
              placeholder="e.g. Swimming Pool — September 2026"
            />
            {showError("title", liveErrors.title) ? (
              <p className="mt-1 text-xs text-red-600">{liveErrors.title}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Amount per resident *</label>
            <ClearableInput
              className={inputClass(showError("amount_per_resident", liveErrors.amount_per_resident))}
              value={form.amount_per_resident}
              onChange={(e) => setField("amount_per_resident", e.target.value.replace(/[^0-9.]/g, ""))}
              onBlur={() => touch("amount_per_resident")}
              inputMode="decimal"
              placeholder="e.g. 25"
            />
            {showError("amount_per_resident", liveErrors.amount_per_resident) ? (
              <p className="mt-1 text-xs text-red-600">{liveErrors.amount_per_resident}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Bill screenshot / document *</label>
            <ClearableInput
              type="file"
              accept={BILL_FILE_ACCEPT}
              className={inputClass(showError("file", liveErrors.file))}
              onChange={(e) => {
                setField("file", e.target.files?.[0] ?? null);
                touch("file");
              }}
            />
            <p className="mt-1 text-xs text-slate-400">PDF, Word, JPG, PNG, or WebP. Max 10 MB.</p>
            {form.file ? <p className="mt-1 text-xs font-medium text-slate-600">{form.file.name}</p> : null}
            {showError("file", liveErrors.file) ? (
              <p className="mt-1 text-xs text-red-600">{liveErrors.file}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Description</label>
            <ClearableTextarea
              className={`${inputClass()} min-h-[80px] resize-y`}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Optional note for residents"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="nl-btn-primary" disabled={submitting}>
            {submitting ? "Publishing…" : "Publish bill"}
          </button>
        </div>
      </form>
    </div>
  );
}
