"use client";

import { formatCommunityMoney } from "@/lib/money";
import { BILL_FILE_ACCEPT, todayIsoDate } from "@/lib/admin/amenity-bill-validation";
import { inputClass, type FieldErrors } from "@/lib/admin/form-validation-utils";

export type BookingPaymentForm = {
  file: File | null;
  payment_date: string;
  payment_reference: string;
  payment_note: string;
  method: "bank_ach" | "proof";
};

export function bookingFeeAmount(value?: number | null): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function normalizeCapacityBookingType(
  type?: string | string[] | null,
): "per_seat" | "full_slot" {
  const raw = Array.isArray(type) ? type[0] : type;
  return String(raw ?? "").trim().toLowerCase() === "full_slot" ? "full_slot" : "per_seat";
}

export function isFullSlotCapacity(type?: string | string[] | null): boolean {
  return normalizeCapacityBookingType(type) === "full_slot";
}

export function reservationFeeTotal(unitFee: number, guests: number, fullSlot = false): number {
  if (!(unitFee > 0)) return 0;
  return fullSlot ? unitFee : unitFee * Math.max(1, guests);
}

export function maxBookableSeats(options: {
  capacity?: number | null;
  remaining?: number | null;
  remainingForward?: number | null;
  fullSlot?: boolean;
}): number {
  if (options.fullSlot) return 1;
  const forward = options.remainingForward != null ? Number(options.remainingForward) : null;
  const remaining = options.remaining != null ? Number(options.remaining) : null;
  const capacity = Number(options.capacity) || 0;
  const n = forward ?? remaining ?? capacity;
  return Math.max(1, n > 0 ? n : capacity || 1);
}

export function BookingPaymentSummary({
  amenityName,
  date,
  slot,
  fee,
  guests,
  unitFee,
  fullSlot = false,
}: {
  amenityName: string;
  date: string;
  slot?: string | null;
  fee: number;
  guests?: number;
  unitFee?: number;
  fullSlot?: boolean;
}) {
  const guestCount = Math.max(1, Number(guests) || 1);
  const perPerson = unitFee != null && unitFee > 0 ? unitFee : guestCount > 1 && fee > 0 ? fee / guestCount : fee;

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
      {!fullSlot && guestCount > 0 ? (
        <p className="mt-1">
          <span className="font-semibold text-slate-500">Seats: </span>
          {guestCount}
        </p>
      ) : null}
      {fullSlot ? (
        <p className="mt-1">
          <span className="font-semibold text-slate-500">Capacity: </span>
          Entire slot reserved
        </p>
      ) : null}
      <p className="mt-1">
        <span className="font-semibold text-slate-500">Reservation fee: </span>
        <span className="font-bold text-slate-900">
          {fee > 0 && fullSlot
            ? `${formatCommunityMoney(fee)} (per slot)`
            : fee > 0 && perPerson > 0 && guestCount > 1
              ? `${formatCommunityMoney(perPerson)} × ${guestCount} = ${formatCommunityMoney(fee)}`
              : formatCommunityMoney(fee)}
        </span>
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
  bankAvailable,
  bankLabel,
  communityBankReady,
}: {
  fee: number;
  form: BookingPaymentForm;
  errors: FieldErrors;
  showError: (field: string, liveErrors?: FieldErrors) => string | undefined;
  onChange: <K extends keyof BookingPaymentForm>(key: K, value: BookingPaymentForm[K]) => void;
  onBlur?: (field: keyof BookingPaymentForm) => void;
  bankAvailable?: boolean;
  bankLabel?: string | null;
  communityBankReady?: boolean;
}) {
  if (fee <= 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-teal-200 bg-[#D1FAF5]/70 p-4">
      <p className="text-sm font-medium text-[#0A2A43]">
        Pay {formatCommunityMoney(fee)} to the community
        {communityBankReady ? " — from your bank or with a screenshot." : " and upload your payment proof."}
      </p>
      {bankAvailable ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange("method", "bank_ach")}
            className={[
              "rounded-xl border px-3 py-2 text-left text-xs font-semibold",
              form.method === "bank_ach"
                ? "border-teal-500 bg-white text-[#0A2A43]"
                : "border-slate-200 bg-white/70 text-slate-600",
            ].join(" ")}
          >
            Pay {formatCommunityMoney(fee)} with bank
            {bankLabel ? <span className="mt-0.5 block font-medium text-slate-500">{bankLabel}</span> : null}
          </button>
          <button
            type="button"
            onClick={() => onChange("method", "proof")}
            className={[
              "rounded-xl border px-3 py-2 text-left text-xs font-semibold",
              form.method === "proof"
                ? "border-[#0A2A43] bg-white text-[#0A2A43]"
                : "border-slate-200 bg-white/70 text-slate-600",
            ].join(" ")}
          >
            Upload proof
          </button>
        </div>
      ) : communityBankReady ? (
        <p className="rounded-lg bg-white/80 px-3 py-2 text-xs text-slate-600">
          Connect a bank on Payments to pay this fee by ACH. Screenshot upload is still available.
        </p>
      ) : null}
      {form.method === "bank_ach" && bankAvailable ? (
        <p className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs text-[#0A2A43]">
          We will debit {bankLabel || "your linked bank"} and credit the community account.
        </p>
      ) : null}
      {form.method !== "bank_ach" || !bankAvailable ? (
      <>
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
      </>
      ) : null}
    </div>
  );
}
