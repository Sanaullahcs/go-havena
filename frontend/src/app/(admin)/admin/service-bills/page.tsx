"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock3, Receipt, X, XCircle } from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { AmenityPaymentRejectModal } from "@/components/admin/amenity-payment-reject-modal";
import { UtilityBillPreview } from "@/components/admin/utility-bill-preview";
import {
  AdminBadge,
  DataTable,
  DtCell,
  DtHead,
  DtPagination,
  DtRow,
  DtTable,
  StatTile,
} from "@/components/admin/ui";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import {
  currentBillingMonth,
  formatBillDate,
  formatUsdAmount,
} from "@/lib/admin/amenity-bill-validation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { adminClientTableBusy, isAdminSearchPending } from "@/lib/admin/table-loading";
import { apiError } from "@/lib/api/client";
import type { AmenityPaymentRejectionCode, AmenityResidentPayment } from "@/lib/api/amenities";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  approveServiceBill,
  fetchAdminServiceBill,
  fetchAdminServiceBills,
  rejectServiceBill,
  type ServiceApplicationType,
  type ServiceBillReview,
  type ServiceBillStatus,
  type UnitServiceBill,
} from "@/lib/api/property-services";

type TypeTab = "all" | Extract<ServiceApplicationType, "automatic" | "optional"> | "pending_verification";
type StatusFilter = "all" | ServiceBillStatus;

const STATUS_FILTERS: StatusFilter[] = [
  "all",
  "paid",
  "overdue",
  "pending_verification",
  "rejected",
  "unpaid",
  "acknowledged",
];

function statusFilterLabel(status: StatusFilter) {
  if (status === "all") return "All statuses";
  if (status === "paid") return "Approved";
  if (status === "pending_verification") return "Pending";
  if (status === "acknowledged") return "Acknowledged";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function billApplicationType(bill: UnitServiceBill): Extract<ServiceApplicationType, "automatic" | "optional"> {
  return bill.application_type === "optional" ? "optional" : "automatic";
}

function billMatchesTab(bill: UnitServiceBill, tab: TypeTab) {
  if (tab === "all") return true;
  if (tab === "pending_verification") return bill.status === "pending_verification";
  return billApplicationType(bill) === tab;
}

function canReviewBill(bill: UnitServiceBill) {
  return bill.can_review === true || bill.status === "pending_verification";
}

function billStatusMeta(bill: Pick<UnitServiceBill, "status" | "status_label">) {
  if (bill.status === "paid") return { label: bill.status_label || "Approved", tone: "emerald" as const };
  if (bill.status === "pending_verification") return { label: bill.status_label || "Pending", tone: "amber" as const };
  if (bill.status === "acknowledged") return { label: bill.status_label || "Acknowledged", tone: "blue" as const };
  if (bill.status === "rejected" || bill.status === "overdue") {
    return { label: bill.status_label || (bill.status === "overdue" ? "Overdue" : "Rejected"), tone: "red" as const };
  }
  return { label: bill.status_label || "Unpaid", tone: "slate" as const };
}

function formatAcknowledgedAt(value?: string | null): string {
  if (!value) return "—";
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function reviewActionLabel(action?: string | null) {
  if (action === "approved") return "Approved";
  if (action === "rejected") return "Rejected";
  if (action === "submitted") return "Proof submitted";
  if (action === "acknowledged") return "Acknowledged";
  return action ? action.replaceAll("_", " ") : "Update";
}

export default function AdminServiceBillsPage() {
  const [bills, setBills] = useState<UnitServiceBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [typeTab, setTypeTab] = useState<TypeTab>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<UnitServiceBill | null>(null);
  const [rejecting, setRejecting] = useState<UnitServiceBill | null>(null);
  const searchParams = useSearchParams();
  const focusBill = searchParams.get("bill");
  const openedBillRef = useRef<string | null>(null);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    try {
      setError(null);
      const rows = await fetchAdminServiceBills();
      setBills(rows);
      setViewing((current) => (current ? rows.find((row) => row.id === current.id) ?? current : null));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!focusBill || loading || bills.length === 0 || openedBillRef.current === focusBill) return;
    const match = bills.find((bill) => String(bill.id) === focusBill);
    if (!match) return;
    openedBillRef.current = focusBill;
    void openDetails(match);
  }, [focusBill, loading, bills]);

  const scoped = useMemo(
    () => bills.filter((bill) => billMatchesTab(bill, typeTab)),
    [bills, typeTab],
  );

  const stats = useMemo(() => {
    const month = currentBillingMonth();
    const thisMonth = scoped.filter((bill) => (bill.billing_period || "").startsWith(month));
    return {
      approved: scoped.filter((bill) => bill.status === "paid").length,
      rejected: scoped.filter((bill) => bill.status === "rejected").length,
      pending: scoped.filter((bill) => bill.status === "pending_verification").length,
      monthPaid: thisMonth.filter((bill) => bill.status === "paid").length,
      monthTotal: thisMonth.length,
    };
  }, [scoped]);

  const statusOptions = useMemo(
    () => STATUS_FILTERS.map((status) => {
      const count = status === "all"
        ? scoped.length
        : scoped.filter((bill) => bill.status === status).length;
      return {
        value: status,
        label: count > 0 ? `${statusFilterLabel(status)} (${count})` : statusFilterLabel(status),
      };
    }),
    [scoped],
  );

  const filtered = useMemo(() => {
    const byStatus = statusFilter === "all"
      ? scoped
      : scoped.filter((bill) => bill.status === statusFilter);
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return byStatus;
    return byStatus.filter((bill) => {
      const haystack = [
        bill.title,
        bill.service_name,
        bill.unit_number,
        bill.billing_contact?.name,
        bill.status,
        bill.status_label,
        bill.billing_period_label,
        bill.amount != null ? String(bill.amount) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [scoped, debouncedSearch, statusFilter]);

  const deferredFiltered = useDeferredValue(filtered);
  const isDeferredPending = deferredFiltered !== filtered;
  const tableBusy = adminClientTableBusy(isPending, isDeferredPending, searchInput, debouncedSearch, refreshing, saving);

  const lastPage = Math.max(1, Math.ceil(deferredFiltered.length / ADMIN_TABLE_PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * ADMIN_TABLE_PAGE_SIZE;
    return deferredFiltered.slice(start, start + ADMIN_TABLE_PAGE_SIZE);
  }, [deferredFiltered, page]);

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  const typeCounts = useMemo(() => ({
    automatic: bills.filter((bill) => billApplicationType(bill) === "automatic").length,
    optional: bills.filter((bill) => billApplicationType(bill) === "optional").length,
    pending: bills.filter((bill) => bill.status === "pending_verification").length,
  }), [bills]);

  const filters = useMemo(() => ([
    { key: "all" as const, label: "All", count: bills.length },
    { key: "automatic" as const, label: "Automatic", count: typeCounts.automatic },
    { key: "optional" as const, label: "Optional", count: typeCounts.optional },
    { key: "pending_verification" as const, label: "Pending verification", count: typeCounts.pending },
  ]), [bills.length, typeCounts.automatic, typeCounts.optional, typeCounts.pending]);

  async function handleApprove(bill: UnitServiceBill) {
    const ok = await confirmAction({
      title: "Approve this payment?",
      text: `Unit ${bill.unit_number || "—"} · ${formatUsdAmount(bill.amount)} will be marked as paid.`,
      confirmText: "Approve",
      color: "green",
    });
    if (!ok.isConfirmed) return;
    setSaving(true);
    try {
      await approveServiceBill(bill.id);
      toastSuccess("Payment approved.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function openDetails(bill: UnitServiceBill) {
    setViewing(bill);
    try {
      const detail = await fetchAdminServiceBill(bill.id);
      setViewing(detail);
    } catch {
      // List payload already has bill + proof; reviews are optional.
    }
  }

  if (loading) return <PageLoader />;
  if (error) return <PageError message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Unit billing</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Service bills</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Review unit payment proofs for automatic and optional services. Approve or reject submitted receipts from the table.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Approved" value={String(stats.approved)} icon={<CheckCircle2 className="h-4 w-4" />} tone="emerald" />
        <StatTile label="Rejected" value={String(stats.rejected)} icon={<XCircle className="h-4 w-4" />} tone="red" />
        <StatTile label="Pending" value={String(stats.pending)} icon={<Clock3 className="h-4 w-4" />} tone="amber" />
        <StatTile
          label="This month"
          value={`${stats.monthPaid}/${stats.monthTotal}`}
          hint="Approved / total bills this month"
          icon={<CalendarDays className="h-4 w-4" />}
          tone="blue"
        />
      </div>

      <DataTable
        title={
          typeTab === "all"
            ? "All service bills"
            : typeTab === "automatic"
              ? "Automatic service bills"
              : typeTab === "optional"
                ? "Optional service bills"
                : "Pending verification"
        }
        totalCount={scoped.length}
        visibleCount={filtered.length}
        search={searchInput}
        onSearch={(value) => startTransition(() => { setSearchInput(value); setPage(1); })}
        searchPlaceholder="Search by unit, service, resident, status…"
        searching={isSearchPending}
        filters={filters}
        activeFilter={typeTab}
        onFilter={(key) => startTransition(() => { setTypeTab(key as TypeTab); setStatusFilter("all"); setPage(1); })}
        toolbar={
          <>
            <span className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
            <div className="nl-picker-compact w-[168px]">
              <ThemedSelect
                value={statusFilter}
                onChange={(value) => startTransition(() => {
                  setStatusFilter(value as StatusFilter);
                  setPage(1);
                })}
                options={statusOptions}
                placeholder="All statuses"
              />
            </div>
          </>
        }
        loading={tableBusy}
        empty={
          scoped.length === 0
            ? typeTab === "all"
              ? "No service bills yet."
              : typeTab === "automatic"
                ? "No automatic service bills yet."
                : typeTab === "optional"
                  ? "No optional service bills yet."
                  : "No payment proofs waiting for review."
            : statusFilter !== "all" && !debouncedSearch.trim()
              ? `No ${statusFilterLabel(statusFilter).toLowerCase()} bills in this tab.`
              : "No bills match your filters."
        }
        isEmpty={deferredFiltered.length === 0}
      >
        <DtTable>
          <DtHead
            cols={[
              { label: "Bill" },
              { label: "Unit" },
              { label: "Resident" },
              { label: "Amount" },
              { label: "Period" },
              { label: "Status" },
              { label: "Actions", right: true },
            ]}
          />
          <tbody>
            {paged.map((bill) => {
              const status = billStatusMeta(bill);
              const reviewable = canReviewBill(bill);
              return (
                <DtRow key={bill.id}>
                  <DtCell first>
                    <p className="font-semibold text-slate-900">{bill.service_name || bill.title}</p>
                    <p className="text-xs text-slate-400">{bill.title}</p>
                  </DtCell>
                  <DtCell nowrap>{bill.unit_number || "—"}</DtCell>
                  <DtCell>
                    <p className="text-slate-800">{bill.billing_contact?.name || "No billing contact"}</p>
                    {bill.missing_billing_contact ? (
                      <p className="text-xs text-amber-700">Missing contact</p>
                    ) : null}
                  </DtCell>
                  <DtCell nowrap>{formatUsdAmount(bill.amount)}</DtCell>
                  <DtCell>
                    <p>{bill.billing_period_label || bill.billing_period || "—"}</p>
                    <p className="text-xs text-slate-400">
                      {bill.billing_frequency === "yearly"
                        ? "Per year"
                        : bill.billing_frequency === "one_time"
                          ? "One-time"
                          : bill.billing_frequency === "monthly"
                            ? "Per month"
                            : ""}
                      {bill.billing_frequency ? " · " : ""}Due {formatBillDate(bill.due_date)}
                    </p>
                  </DtCell>
                  <DtCell>
                    <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      disabled={saving}
                      actions={[
                        { label: "View Details", icon: "view", onClick: () => void openDetails(bill) },
                        {
                          label: "Approve payment",
                          icon: "approve",
                          tone: "success",
                          hidden: !reviewable,
                          onClick: () => void handleApprove(bill),
                        },
                        {
                          label: "Reject payment",
                          icon: "reject",
                          tone: "danger",
                          hidden: !reviewable,
                          onClick: () => setRejecting(bill),
                        },
                      ]}
                    />
                  </DtCell>
                </DtRow>
              );
            })}
          </tbody>
        </DtTable>
        <DtPagination
          showing={paged.length}
          total={deferredFiltered.length}
          page={page}
          lastPage={lastPage}
          onPageChange={(nextPage) => startTransition(() => setPage(nextPage))}
        />
      </DataTable>

      {viewing && (
        <ServiceBillDetailModal
          bill={viewing}
          busy={saving}
          onClose={() => setViewing(null)}
          onApprove={canReviewBill(viewing) ? () => void handleApprove(viewing) : undefined}
          onReject={canReviewBill(viewing) ? () => setRejecting(viewing) : undefined}
        />
      )}

      {rejecting && (
        <AmenityPaymentRejectModal
          payment={{
            resident_bill_id: rejecting.id,
            resident_name: rejecting.billing_contact?.name || rejecting.unit_number || "Unit",
            billing_month_label: rejecting.billing_period_label,
          } as AmenityResidentPayment}
          submitting={saving}
          onClose={() => setRejecting(null)}
          onSubmit={async (payload: { rejection_code: AmenityPaymentRejectionCode; rejection_reason?: string }) => {
            setSaving(true);
            try {
              await rejectServiceBill(rejecting.id, payload.rejection_code, payload.rejection_reason);
              toastSuccess("Payment rejected.");
              setRejecting(null);
              await load(true);
            } catch (err) {
              toastError(apiError(err));
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

function ServiceBillDetailModal({
  bill,
  busy,
  onClose,
  onApprove,
  onReject,
}: {
  bill: UnitServiceBill;
  busy?: boolean;
  onClose: () => void;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const status = billStatusMeta(bill);
  const proof = bill.payment_proof;
  const reviews = bill.reviews ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-400" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Bill details</p>
            </div>
            <h2 className="mt-1 truncate text-lg font-bold text-slate-900">{bill.service_name || bill.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
              <AdminBadge tone={billApplicationType(bill) === "automatic" ? "blue" : "emerald"}>
                {billApplicationType(bill) === "automatic" ? "Automatic" : "Optional"}
              </AdminBadge>
            </div>
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

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Title" value={bill.title || "—"} />
            <DetailRow label="Unit" value={bill.unit_number || "—"} />
            <DetailRow label="Billing contact" value={bill.billing_contact?.name || "No billing contact"} />
            <DetailRow label="Amount" value={formatUsdAmount(bill.amount)} />
            <DetailRow
              label="Bill type"
              value={
                bill.billing_frequency === "yearly"
                  ? "Per year"
                  : bill.billing_frequency === "one_time"
                    ? "One-time"
                    : bill.billing_frequency === "monthly"
                      ? "Per month"
                      : "—"
              }
            />
            <DetailRow label="Billing period" value={bill.billing_period_label || bill.billing_period || "—"} />
            <DetailRow label="Due date" value={formatBillDate(bill.due_date)} />
            {bill.description ? (
              <div className="sm:col-span-2">
                <DetailRow label="Description" value={bill.description} />
              </div>
            ) : null}
            {bill.payment_instructions ? (
              <div className="sm:col-span-2">
                <DetailRow label="Payment instructions" value={bill.payment_instructions} />
              </div>
            ) : null}
            {bill.status === "rejected" && bill.rejection_reason ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">Rejection reason</dt>
                <dd className="mt-1 text-sm text-rose-700">{bill.rejection_reason}</dd>
              </div>
            ) : null}
            {bill.acknowledged_at ? (
              <>
                <DetailRow
                  label="Member"
                  value={bill.acknowledged_by_name || bill.billing_contact?.name || "—"}
                />
                <DetailRow label="Acknowledgement" value="Acknowledged" />
                <DetailRow label="Acknowledged" value={formatAcknowledgedAt(bill.acknowledged_at)} />
                <DetailRow label="Bill" value={bill.title || bill.service_name || `Bill #${bill.id}`} />
              </>
            ) : null}
          </dl>

          {bill.invoice?.file_url ? (
            <UtilityBillPreview url={bill.invoice.file_url} label={bill.invoice.file_name || "Invoice"} />
          ) : null}

          <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Payment proof</p>
            {proof ? (
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <DetailRow label="Payment date" value={formatBillDate(proof.payment_date)} />
                <DetailRow label="Reference" value={proof.payment_reference || "—"} />
                <div className="sm:col-span-2">
                  <DetailRow label="Resident note" value={proof.payment_note || "—"} />
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No payment proof uploaded yet.</p>
            )}
            {proof?.file_url ? (
              <div className="mt-3">
                <UtilityBillPreview url={proof.file_url} label={proof.file_name || "Payment proof"} />
              </div>
            ) : null}
          </section>

          {reviews.length > 0 ? (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Review history</p>
              <ol className="mt-2 space-y-2">
                {reviews.map((review) => (
                  <ReviewRow key={review.id} review={review} />
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" className="nl-btn-secondary" onClick={onClose}>Close</button>
          {onReject ? (
            <button type="button" disabled={busy} className="nl-btn-secondary text-rose-700" onClick={onReject}>
              Reject
            </button>
          ) : null}
          {onApprove ? (
            <button type="button" disabled={busy} className="nl-btn-primary" onClick={onApprove}>
              Approve
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ review }: { review: ServiceBillReview }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{reviewActionLabel(review.action)}</p>
        <p className="text-xs text-slate-400">{review.created_at ? formatBillDate(review.created_at) : ""}</p>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{review.actor_name || "System"}</p>
      {review.rejection_reason ? (
        <p className="mt-1 text-xs text-rose-700">{review.rejection_reason}</p>
      ) : null}
    </li>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{value}</dd>
    </div>
  );
}
