"use client";

import { ClearableTextarea } from "@/components/admin/clearable-field";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { PAYMENT_REJECTION_REASONS, validatePaymentRejection } from "@/lib/admin/amenity-bill-validation";
import { inputClass } from "@/lib/admin/form-validation-utils";
import type { AmenityPaymentRejectionCode, AmenityResidentPayment } from "@/lib/api/amenities";

export function AmenityPaymentRejectModal({
  payment,
  submitting,
  onClose,
  onSubmit,
}: {
  payment: AmenityResidentPayment;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: { rejection_code: AmenityPaymentRejectionCode; rejection_reason?: string }) => void | Promise<void>;
}) {
  const [form, setForm] = useState<{
    rejection_code: AmenityPaymentRejectionCode | "";
    rejection_reason: string;
  }>({ rejection_code: "", rejection_reason: "" });
  const liveErrors = useMemo(() => validatePaymentRejection(form), [form]);
  const { showError, touch, validateOnSubmit } = useTouchedFieldErrors();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateOnSubmit(liveErrors) || !form.rejection_code) return;
    void onSubmit({
      rejection_code: form.rejection_code,
      rejection_reason: form.rejection_code === "other" ? form.rejection_reason.trim() : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Rejection reason</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {payment.resident_name || "Resident"}
              {payment.billing_month_label ? ` · ${payment.billing_month_label}` : ""}
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

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Rejection reason *</label>
            <select
              value={form.rejection_code}
              onChange={(e) => {
                touch("rejection_code");
                setForm((prev) => ({
                  ...prev,
                  rejection_code: e.target.value as AmenityPaymentRejectionCode | "",
                }));
              }}
              className={inputClass(showError("rejection_code", liveErrors.rejection_code))}
            >
              <option value="">Select a reason</option>
              {PAYMENT_REJECTION_REASONS.map((reason) => (
                <option key={reason.code} value={reason.code}>
                  {reason.label}
                </option>
              ))}
            </select>
            {showError("rejection_code", liveErrors.rejection_code) ? (
              <p className="mt-1 text-xs text-red-600">{liveErrors.rejection_code}</p>
            ) : null}
          </div>

          {form.rejection_code === "other" ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Other reason *</label>
              <ClearableTextarea
                value={form.rejection_reason}
                onChange={(e) => {
                  touch("rejection_reason");
                  setForm((prev) => ({ ...prev, rejection_reason: e.target.value }));
                }}
                rows={3}
                className={inputClass(showError("rejection_reason", liveErrors.rejection_reason))}
                placeholder="Explain why this payment is being rejected"
              />
              {showError("rejection_reason", liveErrors.rejection_reason) ? (
                <p className="mt-1 text-xs text-red-600">{liveErrors.rejection_reason}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Rejecting…" : "Reject Payment"}
          </button>
        </div>
      </form>
    </div>
  );
}
