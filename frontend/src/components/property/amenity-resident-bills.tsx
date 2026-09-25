"use client";

import { useEffect, useState } from "react";
import { AmenityPaymentAcknowledgementCard } from "@/components/property/amenity-payment-acknowledgement";
import { AmenityPaymentProofModal } from "@/components/property/amenity-payment-proof-modal";
import {
  billStatusTone,
  formatBillAmount,
  formatBillDate,
} from "@/lib/admin/amenity-bill-validation";
import { toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  fetchAmenityBills,
  submitAmenityBillProof,
  type Amenity,
  type AmenityMonthlyBill,
  type AmenityPaymentProofForm,
} from "@/lib/api/amenities";
import { fetchAchCapability, paySharedBillWithBank, type AchCapability } from "@/lib/api/resident-plaid";

function statusClass(status?: string | null) {
  const tone = billStatusTone(status);
  if (tone === "blue") return "bg-blue-50 text-blue-700";
  if (tone === "green") return "bg-teal-50 text-[#0D9488]";
  if (tone === "amber") return "bg-amber-50 text-amber-700";
  if (tone === "red") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function SubmittedProof({ bill }: { bill: AmenityMonthlyBill }) {
  const proof = bill.payment_proof;
  if (!proof) return null;

  return (
    <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Submitted proof</p>
      {proof.payment_date ? (
        <p className="mt-1 text-[12px] text-slate-600">Paid {formatBillDate(proof.payment_date)}</p>
      ) : null}
      {proof.payment_reference ? (
        <p className="text-[12px] text-slate-600">Ref {proof.payment_reference}</p>
      ) : null}
      {proof.payment_note ? <p className="text-[12px] text-slate-500">{proof.payment_note}</p> : null}
      {proof.file_url ? (
        <a
          href={proof.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-[12px] font-semibold text-[#1B4F8A]"
        >
          {proof.file_name || "View receipt"}
        </a>
      ) : null}
    </div>
  );
}

export function AmenityResidentBills({ amenity }: { amenity: Amenity }) {
  const [bills, setBills] = useState<AmenityMonthlyBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<AmenityMonthlyBill | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [capability, setCapability] = useState<AchCapability | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchAmenityBills(amenity.id), fetchAchCapability().catch(() => null)])
      .then(([rows, nextCapability]) => {
        if (!cancelled) {
          setBills(rows);
          setCapability(nextCapability);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(apiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [amenity.id]);

  const handleSubmitProof = async (payload: AmenityPaymentProofForm) => {
    if (!uploading?.resident_bill_id) return;
    setSubmitting(true);
    try {
      const result = await submitAmenityBillProof(amenity.id, uploading.resident_bill_id, payload);
      setBills((current) =>
        current.map((bill) => (bill.resident_bill_id === result.data.resident_bill_id ? result.data : bill)),
      );
      setUploading(null);
      toastSuccess(result.message);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!amenity.shared_billing_enabled && !loading && bills.length === 0) {
    return null;
  }

  const outstanding = bills.find((bill) => bill.outstanding_previous_bill)?.outstanding_previous_bill ?? null;
  const restricted = bills.some((bill) => bill.has_overdue_shared_amenity_bill)
    || Boolean(amenity.has_overdue_shared_amenity_bill);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Billing history</p>
      {restricted && outstanding ? (
        <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-2 text-[12px] text-rose-700">
          You still have an unpaid {amenity.name} bill from {outstanding.billing_month_label}. Please
          clear the outstanding amount.
        </p>
      ) : null}
      {loading ? <p className="mt-1 text-[12px] text-slate-400">Loading bills…</p> : null}
      {error ? <p className="mt-1 text-[12px] text-red-600">{error}</p> : null}
      {!loading && !error && bills.length === 0 ? (
        <p className="mt-1 text-[12px] text-slate-400">No billing history yet.</p>
      ) : null}
      <div className="mt-2 space-y-2">
        {bills.map((bill) => (
          <div key={bill.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-slate-900">{amenity.name}</p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {bill.billing_month_label} · {formatBillAmount(bill.amount ?? bill.amount_per_resident)}
                </p>
                <p className="text-[12px] text-slate-500">Due {formatBillDate(bill.due_date)}</p>
                {bill.status === "paid" && bill.paid_at ? (
                  <p className="text-[12px] text-slate-500">Paid {formatBillDate(bill.paid_at)}</p>
                ) : null}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${statusClass(bill.status)}`}
              >
                {bill.status_label || "Unpaid"}
              </span>
            </div>
            {bill.file_url ? (
              <a
                href={bill.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-[12px] font-semibold text-[#0D9488]"
              >
                {bill.file_name || "View bill"}
              </a>
            ) : null}
            {bill.status === "pending_verification" ? (
              <p className="mt-2 text-[12px] text-slate-600">
                Payment proof submitted. Your Community Admin will review it.
              </p>
            ) : null}
            {(bill.status === "rejected" || bill.status === "overdue") && bill.rejection_reason ? (
              <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-2 text-[12px] text-rose-700">
                Rejected: {bill.rejection_reason}
              </p>
            ) : null}
            {bill.status === "paid" && bill.payment_acknowledgement ? (
              <AmenityPaymentAcknowledgementCard acknowledgement={bill.payment_acknowledgement} />
            ) : null}
            {bill.payment_method === "bank_ach" && bill.ach_status ? (
              <p className="mt-2 text-[12px] text-slate-600">
                Bank payment {bill.ach_status.replaceAll("_", " ")}
              </p>
            ) : null}
            {bill.can_submit_proof && bill.resident_bill_id ? (
              <div className="mt-2 space-y-1.5">
                {capability?.can_pay_with_bank ? (
                  <button
                    type="button"
                    disabled={payingId === bill.resident_bill_id}
                    onClick={async () => {
                      if (!bill.resident_bill_id) return;
                      setPayingId(bill.resident_bill_id);
                      try {
                        const result = await paySharedBillWithBank(amenity.id, bill.resident_bill_id);
                        if (result?.data?.bill) {
                          setBills((current) =>
                            current.map((row) => (row.resident_bill_id === result.data.bill.resident_bill_id ? result.data.bill : row)),
                          );
                        }
                        toastSuccess(result.message || "Paid from your bank.");
                      } catch (err) {
                        toastError(apiError(err));
                      } finally {
                        setPayingId(null);
                      }
                    }}
                    className="w-full rounded-lg py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
                    style={{ background: "#0D9488" }}
                  >
                    {payingId === bill.resident_bill_id ? "Sending ACH…" : "Pay with bank"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setUploading(bill)}
                  className="w-full rounded-lg bg-[#0A2A43] py-1.5 text-[12px] font-bold text-white"
                >
                  {bill.status === "rejected" ? "Upload new payment proof" : "Upload Payment Proof"}
                </button>
              </div>
            ) : null}
            <SubmittedProof bill={bill} />
          </div>
        ))}
      </div>

      {uploading ? (
        <AmenityPaymentProofModal
          bill={uploading}
          amenityName={amenity.name}
          submitting={submitting}
          onClose={() => {
            if (!submitting) setUploading(null);
          }}
          onSubmit={handleSubmitProof}
        />
      ) : null}
    </div>
  );
}
