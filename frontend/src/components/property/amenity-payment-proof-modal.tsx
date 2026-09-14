"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import {
  BILL_FILE_ACCEPT,
  todayIsoDate,
  validatePaymentProofForm,
} from "@/lib/admin/amenity-bill-validation";
import { inputClass } from "@/lib/admin/form-validation-utils";
import type { AmenityMonthlyBill, AmenityPaymentProofForm } from "@/lib/api/amenities";

export function AmenityPaymentProofModal({
  bill,
  amenityName,
  submitting,
  onClose,
  onSubmit,
}: {
  bill: AmenityMonthlyBill;
  amenityName: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: AmenityPaymentProofForm) => void | Promise<void>;
}) {
  const [form, setForm] = useState<AmenityPaymentProofForm>({
    file: null,
    payment_date: todayIsoDate(),
    payment_reference: "",
    payment_note: "",
  });
  const liveErrors = useMemo(() => validatePaymentProofForm(form), [form]);
  const { showError, touch, validateOnSubmit } = useTouchedFieldErrors();

  const setField = <K extends keyof AmenityPaymentProofForm>(key: K, value: AmenityPaymentProofForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
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
            <h2 className="text-lg font-bold text-slate-900">
              {bill.status === "rejected" ? "Upload new payment proof" : "Upload payment proof"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {amenityName}
              {bill.billing_month_label ? ` · ${bill.billing_month_label}` : ""}
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
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Payment screenshot / receipt *
            </label>
            <input
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
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Payment date *</label>
            <input
              type="date"
              max={todayIsoDate()}
              className={inputClass(showError("payment_date", liveErrors.payment_date))}
              value={form.payment_date}
              onChange={(e) => setField("payment_date", e.target.value)}
              onBlur={() => touch("payment_date")}
            />
            {showError("payment_date", liveErrors.payment_date) ? (
              <p className="mt-1 text-xs text-red-600">{liveErrors.payment_date}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Transaction / reference number
            </label>
            <input
              className={inputClass(showError("payment_reference", liveErrors.payment_reference))}
              value={form.payment_reference}
              onChange={(e) => setField("payment_reference", e.target.value)}
              placeholder="Optional"
            />
            {showError("payment_reference", liveErrors.payment_reference) ? (
              <p className="mt-1 text-xs text-red-600">{liveErrors.payment_reference}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Note</label>
            <textarea
              className={`${inputClass(showError("payment_note", liveErrors.payment_note))} min-h-[80px] resize-y`}
              value={form.payment_note}
              onChange={(e) => setField("payment_note", e.target.value)}
              placeholder="Optional"
            />
            {showError("payment_note", liveErrors.payment_note) ? (
              <p className="mt-1 text-xs text-red-600">{liveErrors.payment_note}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="nl-btn-primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit proof"}
          </button>
        </div>
      </form>
    </div>
  );
}
