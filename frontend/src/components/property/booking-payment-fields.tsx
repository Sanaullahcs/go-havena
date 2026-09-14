"use client";

import {
  BILL_FILE_ACCEPT,
  formatUsdAmount,
  todayIsoDate,
} from "@/lib/admin/amenity-bill-validation";
import { inputClass, type FieldErrors } from "@/lib/admin/form-validation-utils";

export type BookingPaymentForm = {
  file: File | null;
  payment_date: string;
  payment_reference: string;
  payment_note: string;
};

export function bookingFeeAmount(value?: number | null): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function BookingPaymentSummary({
  amenityName,
  date,
  slot,
  fee,
}: {
  amenityName: string;
  date: string;
  slot?: string | null;
  fee: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <p>
        <span className="font-semibold text-slate-500">Amenity: </span>
        {amenityName}
      </p>
      <p className="mt-1">
        <span className="font-semibold text-slate-500">Date: </span>
        {date || "—"}
      </p>
      <p className="mt-1">
        <span className="font-semibold text-slate-500">Slot: </span>
        {slot || "Open access"}
      </p>
      <p className="mt-1">
        <span className="font-semibold text-slate-500">Booking Fee: </span>
        <span className="font-bold text-slate-900">{formatUsdAmount(fee)}</span>
      </p>
    </div>
  );
}

export function BookingPaymentFields({
  fee,
  form,
  errors,
  showError,
  onChange,
  onBlur,
}: {
  fee: number;
  form: BookingPaymentForm;
  errors: FieldErrors;
  showError: (field: string, liveErrors?: FieldErrors) => string | undefined;
  onChange: <K extends keyof BookingPaymentForm>(key: K, value: BookingPaymentForm[K]) => void;
  onBlur?: (field: keyof BookingPaymentForm) => void;
}) {
  if (fee <= 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="text-sm font-medium text-amber-950">
        Please pay {formatUsdAmount(fee)} using the community&apos;s accepted payment method and
        upload your payment proof.
      </p>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          Payment Proof Screenshot / Receipt *
        </label>
        <input
          type="file"
          accept={BILL_FILE_ACCEPT}
          className={inputClass(showError("file", errors))}
          onChange={(e) => onChange("file", e.target.files?.[0] ?? null)}
          onBlur={() => onBlur?.("file")}
        />
        {form.file ? <p className="mt-1 text-xs font-medium text-slate-600">{form.file.name}</p> : null}
        {showError("file", errors) ? (
          <p className="mt-1 text-xs text-red-600">{errors.file}</p>
        ) : null}
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Payment Date *</label>
        <input
          type="date"
          max={todayIsoDate()}
          className={inputClass(showError("payment_date", errors))}
          value={form.payment_date}
          onChange={(e) => onChange("payment_date", e.target.value)}
          onBlur={() => onBlur?.("payment_date")}
        />
        {showError("payment_date", errors) ? (
          <p className="mt-1 text-xs text-red-600">{errors.payment_date}</p>
        ) : null}
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          Payment Reference Number
        </label>
        <input
          className={inputClass()}
          value={form.payment_reference}
          onChange={(e) => onChange("payment_reference", e.target.value)}
          placeholder="Optional"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Payment Note</label>
        <textarea
          className={`${inputClass()} min-h-[72px] resize-y`}
          value={form.payment_note}
          onChange={(e) => onChange("payment_note", e.target.value)}
          placeholder="Optional"
        />
      </div>
    </div>
  );
}
