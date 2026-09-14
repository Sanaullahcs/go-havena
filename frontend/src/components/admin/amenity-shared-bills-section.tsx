"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { AmenityPaymentRejectModal } from "@/components/admin/amenity-payment-reject-modal";
import { AdminBadge } from "@/components/admin/ui";
import { AmenityPaymentAcknowledgementCard } from "@/components/property/amenity-payment-acknowledgement";
import {
  billStatusTone,
  formatBillAmount,
  formatBillDate,
} from "@/lib/admin/amenity-bill-validation";
import { toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  approveAmenityResidentPayment,
  fetchAdminAmenityBills,
  fetchAdminAmenityResidentBillReviews,
  fetchAdminAmenityResidentBills,
  rejectAmenityResidentPayment,
  type Amenity,
  type AmenityMonthlyBill,
  type AmenityPaymentRejectionCode,
  type AmenityPaymentReview,
  type AmenityResidentPayment,
} from "@/lib/api/amenities";

const PAYMENT_FILTERS = [
  { id: "all", label: "All" },
  { id: "paid", label: "Paid" },
  { id: "unpaid", label: "Unpaid" },
  { id: "pending_verification", label: "Pending Verification" },
  { id: "rejected", label: "Rejected" },
  { id: "overdue", label: "Overdue" },
] as const;

type PaymentFilter = (typeof PAYMENT_FILTERS)[number]["id"];

function monthlyBadge(bill: AmenityMonthlyBill) {
  const overdue = bill.overdue_count ?? 0;
  if (overdue > 0) {
    return { tone: "red" as const, label: `${overdue} overdue` };
  }
  const pending = bill.pending_count ?? 0;
  if (pending > 0) {
    return { tone: "blue" as const, label: `${pending} pending verification` };
  }
  const unpaid = bill.unpaid_count ?? 0;
  if (unpaid > 0) {
    return { tone: "amber" as const, label: `${unpaid}/${bill.resident_count ?? 0} unpaid` };
  }
  return { tone: "green" as const, label: `${bill.paid_count ?? 0} paid` };
}

function SummaryGrid({ bill }: { bill: AmenityMonthlyBill }) {
  const items = [
    { label: "Total residents billed", value: String(bill.total_residents_billed ?? bill.resident_count ?? 0) },
    { label: "Paid", value: String(bill.paid_count ?? 0) },
    { label: "Unpaid", value: String(bill.unpaid_count ?? 0) },
    { label: "Pending verification", value: String(bill.pending_count ?? 0) },
    { label: "Rejected", value: String(bill.rejected_count ?? 0) },
    { label: "Overdue", value: String(bill.overdue_count ?? 0) },
    { label: "Total amount expected", value: formatBillAmount(bill.total_amount_expected ?? 0) },
    { label: "Total acknowledged / paid", value: formatBillAmount(bill.total_amount_paid ?? 0) },
    { label: "Outstanding amount", value: formatBillAmount(bill.outstanding_amount ?? 0) },
  ];

  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PaymentHistory({ amenityId, residentBillId }: { amenityId: number; residentBillId: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AmenityPaymentReview[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || rows !== null || loading) return;
    setLoading(true);
    setError(null);
    fetchAdminAmenityResidentBillReviews(amenityId, residentBillId)
      .then((data) => setRows(data))
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  };

  return (
    <div className="mt-2">
      <button type="button" onClick={toggle} className="text-xs font-semibold text-[#1B4F8A]">
        {open ? "Hide payment history" : "Payment history"}
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {loading ? <p className="text-xs text-slate-400">Loading payment history…</p> : null}
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {!loading && !error && (rows?.length ?? 0) === 0 ? (
            <p className="text-xs text-slate-400">No payment history yet.</p>
          ) : null}
          {rows?.map((row) => (
            <div key={row.id} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-slate-800">{row.action_label}</p>
                <p className="text-slate-400">{formatBillDate(row.created_at)}</p>
              </div>
              <p className="mt-1">
                {row.status_from_label || "—"} → {row.status_to_label || "—"}
                {row.actor_name ? ` · ${row.actor_name}` : ""}
              </p>
              {row.rejection_reason ? <p className="mt-1 text-rose-700">Reason: {row.rejection_reason}</p> : null}
              {row.proof?.file_url ? (
                <a
                  href={row.proof.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-semibold text-[#1B4F8A]"
                >
                  {row.proof.file_name || "View submitted proof"}
                </a>
              ) : null}
              {row.proof?.payment_reference ? (
                <p className="mt-1">Ref {row.proof.payment_reference}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PaymentRow({
  amenityId,
  payment,
  busy,
  onApprove,
  onReject,
}: {
  amenityId: number;
  payment: AmenityResidentPayment;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const proof = payment.payment_proof;
  const tone = billStatusTone(payment.status);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{payment.resident_name || "Resident"}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Unit {payment.unit_number || "—"} · {payment.amenity_name} · {payment.billing_month_label}
          </p>
        </div>
        <AdminBadge tone={tone}>{payment.status_label}</AdminBadge>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
        <div>
          <dt className="font-semibold text-slate-400">Amount</dt>
          <dd>{formatBillAmount(payment.amount)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">Due date</dt>
          <dd>{formatBillDate(payment.due_date)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">Payment date</dt>
          <dd>{formatBillDate(proof?.payment_date || payment.paid_at)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">Paid date</dt>
          <dd>{formatBillDate(payment.paid_at)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-semibold text-slate-400">Transaction / reference</dt>
          <dd>{proof?.payment_reference || "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-semibold text-slate-400">Resident note</dt>
          <dd>{proof?.payment_note || "—"}</dd>
        </div>
      </dl>

      {proof?.file_url ? (
        <div className="mt-2">
          {proof.mime_type?.startsWith("image/") ? (
            <a href={proof.file_url} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={proof.file_url}
                alt={proof.file_name || "Payment proof"}
                className="max-h-40 rounded-lg border border-slate-200 object-contain"
              />
            </a>
          ) : (
            <a
              href={proof.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B4F8A]"
            >
              <FileText className="h-3.5 w-3.5" />
              {proof.file_name || "View receipt"}
            </a>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">No payment proof uploaded yet.</p>
      )}

      {payment.status === "rejected" && payment.rejection_reason ? (
        <p className="mt-2 text-xs text-rose-700">Rejected: {payment.rejection_reason}</p>
      ) : null}

      {payment.status === "paid" && payment.payment_acknowledgement ? (
        <AmenityPaymentAcknowledgementCard acknowledgement={payment.payment_acknowledgement} />
      ) : null}

      {payment.can_review ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            Approve Payment
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
          >
            Reject Payment
          </button>
        </div>
      ) : null}

      <PaymentHistory amenityId={amenityId} residentBillId={payment.resident_bill_id} />
    </div>
  );
}

export function AmenitySharedBillsSection({
  amenity,
  refreshKey = 0,
  onCreate,
}: {
  amenity: Amenity;
  refreshKey?: number;
  onCreate?: () => void;
}) {
  const [bills, setBills] = useState<AmenityMonthlyBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [payments, setPayments] = useState<AmenityResidentPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<AmenityResidentPayment | null>(null);
  const [statusFilter, setStatusFilter] = useState<PaymentFilter>("all");

  const loadBills = () =>
    fetchAdminAmenityBills(amenity.id).then((rows) => {
      setBills(rows);
    });

  const loadPayments = (monthlyBillId: number) => {
    setPaymentsLoading(true);
    setPaymentsError(null);
    return fetchAdminAmenityResidentBills(amenity.id, monthlyBillId)
      .then((rows) => {
        setPayments(rows);
      })
      .catch((err) => {
        setPaymentsError(apiError(err));
      })
      .finally(() => {
        setPaymentsLoading(false);
      });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAdminAmenityBills(amenity.id)
      .then((rows) => {
        if (!cancelled) setBills(rows);
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
  }, [amenity.id, refreshKey]);

  const toggleReview = (billId: number) => {
    if (expandedId === billId) {
      setExpandedId(null);
      setPayments([]);
      setPaymentsError(null);
      setStatusFilter("all");
      return;
    }
    setExpandedId(billId);
    setStatusFilter("all");
    void loadPayments(billId);
  };

  const handleApprove = async (payment: AmenityResidentPayment) => {
    setReviewingId(payment.resident_bill_id);
    try {
      const result = await approveAmenityResidentPayment(amenity.id, payment.resident_bill_id);
      setPayments((current) =>
        current.map((row) => (row.resident_bill_id === result.data.resident_bill_id ? result.data : row)),
      );
      await loadBills();
      toastSuccess(result.data.payment_acknowledgement?.message || result.message);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setReviewingId(null);
    }
  };

  const handleReject = async (payload: {
    rejection_code: AmenityPaymentRejectionCode;
    rejection_reason?: string;
  }) => {
    if (!rejecting) return;
    setReviewingId(rejecting.resident_bill_id);
    try {
      const result = await rejectAmenityResidentPayment(amenity.id, rejecting.resident_bill_id, payload);
      setPayments((current) =>
        current.map((row) => (row.resident_bill_id === result.data.resident_bill_id ? result.data : row)),
      );
      setRejecting(null);
      await loadBills();
      toastSuccess(result.message);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setReviewingId(null);
    }
  };

  const filteredPayments = useMemo(
    () => (statusFilter === "all" ? payments : payments.filter((payment) => payment.status === statusFilter)),
    [payments, statusFilter],
  );

  return (
    <div className="col-span-2 space-y-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Shared bills</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Shared charges for every resident in {amenity.community_name || "this community"}.
          </p>
        </div>
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className="shrink-0 rounded-lg bg-[#1B4F8A] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#163e6c]"
          >
            Create bill
          </button>
        ) : null}
      </div>

      {loading ? <p className="text-xs text-slate-400">Loading bills…</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {!loading && !error && bills.length === 0 ? (
        <p className="text-xs text-slate-400">No monthly bills published yet.</p>
      ) : null}

      <div className="space-y-2">
        {bills.map((bill) => {
          const badge = monthlyBadge(bill);
          const expanded = expandedId === bill.id;
          return (
            <div key={bill.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{bill.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {bill.billing_month_label} · {formatBillAmount(bill.amount_per_resident)} per resident · due{" "}
                    {formatBillDate(bill.due_date)}
                  </p>
                </div>
                <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
              </div>
              {bill.file_url ? (
                <a
                  href={bill.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1B4F8A]"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {bill.file_name || "View bill"}
                </a>
              ) : null}

              <SummaryGrid bill={bill} />

              <button
                type="button"
                onClick={() => toggleReview(bill.id)}
                className="mt-2 block text-xs font-semibold text-[#1B4F8A]"
              >
                {expanded ? "Hide residents" : "View residents"}
              </button>

              {expanded ? (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {PAYMENT_FILTERS.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setStatusFilter(filter.id)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          statusFilter === filter.id
                            ? "bg-[#1B4F8A] text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  {paymentsLoading ? <p className="text-xs text-slate-400">Loading payments…</p> : null}
                  {paymentsError ? <p className="text-xs text-red-600">{paymentsError}</p> : null}
                  {!paymentsLoading && !paymentsError && filteredPayments.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      {payments.length === 0
                        ? "No resident bills for this month."
                        : "No residents match this filter."}
                    </p>
                  ) : null}
                  {filteredPayments.map((payment) => (
                    <PaymentRow
                      key={payment.resident_bill_id}
                      amenityId={amenity.id}
                      payment={payment}
                      busy={reviewingId === payment.resident_bill_id}
                      onApprove={() => void handleApprove(payment)}
                      onReject={() => setRejecting(payment)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {rejecting ? (
        <AmenityPaymentRejectModal
          payment={rejecting}
          submitting={reviewingId === rejecting.resident_bill_id}
          onClose={() => {
            if (reviewingId !== rejecting.resident_bill_id) setRejecting(null);
          }}
          onSubmit={handleReject}
        />
      ) : null}
    </div>
  );
}
