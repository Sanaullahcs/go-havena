"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarCheck2, Check, Clock3, Receipt, X } from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { BookingInfoModal } from "@/components/admin/booking-info-modal";
import {
  AdminBadge,
  DataTable,
  DtCell,
  DtHead,
  DtRow,
  DtTable,
  StatTile,
} from "@/components/admin/ui";
import { AmenityIcon } from "@/components/admin/amenity-icon";
import { confirmAction, confirmRejectWithReason, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  approveBooking,
  fetchBookingInbox,
  rejectBooking,
  type Booking,
} from "@/lib/api/amenities";
import {
  approveServiceSubscription,
  fetchAdminServiceSubscriptionInbox,
  rejectServiceSubscription,
  type ServiceSubscription,
} from "@/lib/api/property-services";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { getAdminCache, setAdminCache } from "@/lib/admin/navigation-cache";
import { adminTableBusy } from "@/lib/admin/table-loading";
import { formatBookingDisplayFee } from "@/lib/admin/amenity-display";
import { formatCommunityMoney } from "@/lib/money";

type DomainTab = "amenity" | "services";
type StatusFilter = "all" | "pending" | "confirmed" | "rejected";

const AMENITY_STATUS_META: Record<string, { label: string; tone: "amber" | "green" | "red" | "slate" }> = {
  pending: { label: "Pending", tone: "amber" },
  confirmed: { label: "Approved", tone: "green" },
  rejected: { label: "Declined", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

type BookingsCache = {
  amenity: Booking[];
  services: ServiceSubscription[];
};

function readBookingsCache(raw: unknown): BookingsCache | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return { amenity: raw as Booking[], services: [] };
  }
  if (typeof raw === "object" && raw && "amenity" in raw) {
    const cache = raw as BookingsCache;
    return {
      amenity: Array.isArray(cache.amenity) ? cache.amenity : [],
      services: Array.isArray(cache.services) ? cache.services : [],
    };
  }
  return undefined;
}

function formatRequestDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function serviceStatusMeta(status: string, label?: string | null) {
  if (status === "active") return { label: label || "Approved", tone: "green" as const };
  if (status === "pending") return { label: label || "Pending", tone: "amber" as const };
  if (status === "rejected") return { label: label || "Declined", tone: "red" as const };
  if (status === "cancelled") return { label: label || "Cancelled", tone: "slate" as const };
  return { label: label || status, tone: "slate" as const };
}

function serviceMatchesStatus(subscription: ServiceSubscription, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return subscription.status === "pending";
  if (filter === "confirmed") return subscription.status === "active";
  if (filter === "rejected") return subscription.status === "rejected";
  return true;
}

function DomainTabs({
  value,
  onChange,
}: {
  value: DomainTab;
  onChange: (value: DomainTab) => void;
}) {
  return (
    <div className="nl-segment-control">
      {([
        { key: "amenity" as const, label: "Amenity" },
        { key: "services" as const, label: "Services" },
      ]).map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={[
            "nl-segment-control-item",
            value === item.key ? "nl-segment-control-item-active" : "nl-segment-control-item-idle",
          ].join(" ")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function AdminBookingsPage() {
  const searchParams = useSearchParams();
  const requestedStatus = searchParams.get("status");
  const cached = readBookingsCache(getAdminCache<unknown>("bookings:inbox"));
  const [domainTab, setDomainTab] = useState<DomainTab>("amenity");
  const [amenityBookings, setAmenityBookings] = useState<Booking[]>(cached?.amenity ?? []);
  const [serviceSubscriptions, setServiceSubscriptions] = useState<ServiceSubscription[]>(cached?.services ?? []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    requestedStatus === "all" || requestedStatus === "pending" || requestedStatus === "confirmed" || requestedStatus === "rejected"
      ? requestedStatus
      : "pending",
  );
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [viewingSubscription, setViewingSubscription] = useState<ServiceSubscription | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setPageError(null);
    setServicesError(null);
    try {
      const [bookingsResult, subscriptionsResult] = await Promise.allSettled([
        fetchBookingInbox({ status: "all" }),
        fetchAdminServiceSubscriptionInbox(),
      ]);

      if (bookingsResult.status === "rejected") {
        throw bookingsResult.reason;
      }

      const bookings = bookingsResult.value;
      const subscriptions =
        subscriptionsResult.status === "fulfilled" ? subscriptionsResult.value : [];

      if (subscriptionsResult.status === "rejected") {
        setServicesError(apiError(subscriptionsResult.reason));
      }

      setAmenityBookings(bookings);
      setServiceSubscriptions(subscriptions);
      setAdminCache("bookings:inbox", { amenity: bookings, services: subscriptions });
    } catch (err) {
      setPageError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(Boolean(cached));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeRows = domainTab === "amenity" ? amenityBookings : serviceSubscriptions;

  const stats = useMemo(() => {
    if (domainTab === "amenity") {
      const pending = amenityBookings.filter((b) => b.status === "pending").length;
      const confirmed = amenityBookings.filter((b) => b.status === "confirmed").length;
      const rejected = amenityBookings.filter((b) => b.status === "rejected").length;
      return { total: amenityBookings.length, pending, confirmed, rejected };
    }

    const pending = serviceSubscriptions.filter((s) => s.status === "pending").length;
    const confirmed = serviceSubscriptions.filter((s) => s.status === "active").length;
    const rejected = serviceSubscriptions.filter((s) => s.status === "rejected").length;
    return { total: serviceSubscriptions.length, pending, confirmed, rejected };
  }, [domainTab, amenityBookings, serviceSubscriptions]);

  const filters = useMemo(
    () => [
      { key: "pending" as const, label: "Pending", count: stats.pending },
      { key: "confirmed" as const, label: "Approved", count: stats.confirmed },
      { key: "rejected" as const, label: "Declined", count: stats.rejected },
      { key: "all" as const, label: "All", count: stats.total },
    ],
    [stats],
  );

  const filteredAmenity = useMemo(() => {
    const q = search.trim().toLowerCase();
    return amenityBookings.filter((booking) => {
      const matchesStatus = statusFilter === "all" || booking.status === statusFilter;
      const matchesSearch =
        !q ||
        booking.amenity_name.toLowerCase().includes(q) ||
        (booking.user_name ?? "").toLowerCase().includes(q) ||
        (booking.user_unit ?? "").toLowerCase().includes(q) ||
        (booking.time_slot ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [amenityBookings, search, statusFilter]);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return serviceSubscriptions.filter((subscription) => {
      const matchesStatus = serviceMatchesStatus(subscription, statusFilter);
      const matchesSearch =
        !q ||
        (subscription.service_name ?? "").toLowerCase().includes(q) ||
        (subscription.requester_name ?? "").toLowerCase().includes(q) ||
        (subscription.unit_number ?? "").toLowerCase().includes(q) ||
        (subscription.note ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [serviceSubscriptions, search, statusFilter]);

  const filtered = domainTab === "amenity" ? filteredAmenity : filteredServices;

  const handleApproveBooking = async (booking: Booking) => {
    const confirmed = await confirmAction({
      title: "Approve booking?",
      text: `Confirm ${booking.user_name ?? "resident"}'s request for ${booking.amenity_name}.`,
      confirmText: "Approve",
      color: "green",
    });
    if (!confirmed.isConfirmed) return;

    setBusyId(booking.id);
    try {
      await approveBooking(booking.id);
      toastSuccess("Booking approved.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectBooking = async (booking: Booking) => {
    const result = await confirmRejectWithReason({
      title: "Decline booking?",
      text: `Decline ${booking.user_name ?? "resident"}'s request for ${booking.amenity_name}?`,
      confirmText: "Decline",
    });
    if (!result.isConfirmed) return;

    setBusyId(booking.id);
    try {
      const reason = String(result.value ?? "").trim() || undefined;
      await rejectBooking(booking.id, reason);
      toastSuccess("Booking declined.");
      if (viewingBooking?.id === booking.id) {
        setViewingBooking({ ...viewingBooking, status: "rejected", rejection_reason: reason ?? null });
      }
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveSubscription = async (subscription: ServiceSubscription) => {
    const confirmed = await confirmAction({
      title: "Approve subscription?",
      text: `Approve ${subscription.unit_number ?? "this unit"} for ${subscription.service_name ?? "the service"}.`,
      confirmText: "Approve",
      color: "green",
    });
    if (!confirmed.isConfirmed) return;

    setBusyId(subscription.id);
    try {
      await approveServiceSubscription(subscription.id);
      toastSuccess("Subscription approved.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectSubscription = async (subscription: ServiceSubscription) => {
    const result = await confirmRejectWithReason({
      title: "Decline subscription?",
      text: `Decline ${subscription.unit_number ?? "this unit"} for ${subscription.service_name ?? "the service"}?`,
      confirmText: "Decline",
    });
    if (!result.isConfirmed) return;

    setBusyId(subscription.id);
    try {
      const reason = String(result.value ?? "").trim() || undefined;
      await rejectServiceSubscription(subscription.id, reason);
      toastSuccess("Subscription declined.");
      if (viewingSubscription?.id === subscription.id) {
        setViewingSubscription({ ...viewingSubscription, status: "rejected", rejection_reason: reason ?? null });
      }
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  const switchDomain = (next: DomainTab) => {
    startTransition(() => {
      setDomainTab(next);
      setStatusFilter("pending");
      setSearch("");
    });
  };

  if (loading && activeRows.length === 0) return <PageLoader skeleton />;

  if (pageError && activeRows.length === 0) {
    return <PageError message={pageError} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Booking Request</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {domainTab === "amenity"
              ? "Review booking requests for amenities you created. Only the amenity creator can approve or decline reservations."
              : "Review optional service subscription requests from resident units. Approve or decline opt-in requests for your community services."}
          </p>
        </div>
        <DomainTabs value={domainTab} onChange={switchDomain} />
      </div>

      {domainTab === "services" && servicesError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {servicesError}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Inbox total"
          value={String(stats.total)}
          tone="blue"
          icon={domainTab === "amenity" ? <CalendarCheck2 className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
        />
        <StatTile label="Pending" value={String(stats.pending)} tone="amber" icon={<Clock3 className="h-4 w-4" />} />
        <StatTile label="Approved" value={String(stats.confirmed)} tone="green" icon={<Check className="h-4 w-4" />} />
        <StatTile label="Declined" value={String(stats.rejected)} tone="red" icon={<X className="h-4 w-4" />} />
      </div>

      <DataTable
        title={domainTab === "amenity" ? "Booking inbox" : "Service requests"}
        totalCount={domainTab === "amenity" ? amenityBookings.length : serviceSubscriptions.length}
        visibleCount={filtered.length}
        search={search}
        onSearch={(value) => startTransition(() => setSearch(value))}
        loading={adminTableBusy(refreshing, busyId !== null, isPending)}
        activeFilter={statusFilter}
        onFilter={(key) => startTransition(() => setStatusFilter(key as StatusFilter))}
        filters={filters}
        empty={
          domainTab === "amenity"
            ? amenityBookings.length === 0
              ? "No booking requests yet for amenities you created."
              : "No bookings match your filters."
            : serviceSubscriptions.length === 0
              ? "No optional service subscription requests yet."
              : "No service requests match your filters."
        }
        isEmpty={filtered.length === 0}
      >
        {domainTab === "amenity" ? (
          <DtTable>
            <DtHead
              cols={[
                { label: "Facility" },
                { label: "Resident" },
                { label: "Booking date" },
                { label: "Slot / time" },
                { label: "Fee" },
                { label: "Payment" },
                { label: "Requested" },
                { label: "Status" },
                { label: "Actions", right: true },
              ]}
            />
            <tbody>
              {filteredAmenity.map((booking) => {
                const status = AMENITY_STATUS_META[booking.status] ?? AMENITY_STATUS_META.pending;
                const busy = busyId === booking.id;
                const isPending = booking.status === "pending";
                return (
                  <DtRow key={booking.id}>
                    <DtCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                          <AmenityIcon
                            iconKey={booking.amenity_icon_key}
                            name={booking.amenity_name}
                            size={18}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{booking.amenity_name}</p>
                        </div>
                      </div>
                    </DtCell>
                    <DtCell>
                      <p className="font-medium text-slate-900">{booking.user_name || "Resident"}</p>
                      <p className="text-xs text-slate-500">{booking.user_unit || "—"}</p>
                    </DtCell>
                    <DtCell>{booking.date}</DtCell>
                    <DtCell>{booking.time_slot || "Open access"}</DtCell>
                    <DtCell>{formatBookingDisplayFee(booking)}</DtCell>
                    <DtCell>
                      {booking.payment_proof ? (
                        <div>
                          <p>{booking.payment_proof.payment_date || "—"}</p>
                          <p className="text-xs text-slate-500">
                            {booking.payment_proof.payment_reference || "No reference"}
                          </p>
                          {booking.payment_proof.file_url ? (
                            <a
                              href={booking.payment_proof.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-[#1B4F8A]"
                            >
                              View proof
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </DtCell>
                    <DtCell>{formatRequestDate(booking.requested_at ?? booking.created_at)}</DtCell>
                    <DtCell>
                      <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                    </DtCell>
                    <DtCell right>
                      <AdminActionsMenu
                        disabled={busy}
                        actions={[
                          {
                            label: "View info",
                            icon: "view",
                            onClick: () => setViewingBooking(booking),
                          },
                          ...(isPending
                            ? [
                                {
                                  label: "Approve",
                                  icon: "edit" as const,
                                  tone: "success" as const,
                                  onClick: () => void handleApproveBooking(booking),
                                },
                                {
                                  label: "Reject",
                                  icon: "delete" as const,
                                  tone: "danger" as const,
                                  onClick: () => void handleRejectBooking(booking),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </DtCell>
                  </DtRow>
                );
              })}
            </tbody>
          </DtTable>
        ) : (
          <DtTable>
            <DtHead
              cols={[
                { label: "Service" },
                { label: "Unit" },
                { label: "Requester" },
                { label: "Note" },
                { label: "Requested" },
                { label: "Latest bill" },
                { label: "Status" },
                { label: "Actions", right: true },
              ]}
            />
            <tbody>
              {filteredServices.map((subscription) => {
                const status = serviceStatusMeta(subscription.status, subscription.status_label);
                const busy = busyId === subscription.id;
                const isPending = subscription.status === "pending";
                return (
                  <DtRow key={subscription.id}>
                    <DtCell>
                      <p className="truncate font-semibold text-slate-900">{subscription.service_name || "Service"}</p>
                    </DtCell>
                    <DtCell>{subscription.unit_number || "—"}</DtCell>
                    <DtCell>{subscription.requester_name || "Billing contact"}</DtCell>
                    <DtCell>
                      <p className="max-w-[220px] truncate text-slate-700">{subscription.note || "—"}</p>
                    </DtCell>
                    <DtCell>{formatRequestDate(subscription.created_at)}</DtCell>
                    <DtCell>
                      {subscription.latest_bill ? (
                        <div>
                          <p>{formatCommunityMoney(subscription.latest_bill.amount)}</p>
                          <p className="text-xs text-slate-500">
                            {subscription.latest_bill.status_label || subscription.latest_bill.status}
                          </p>
                        </div>
                      ) : (
                        "—"
                      )}
                    </DtCell>
                    <DtCell>
                      <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                    </DtCell>
                    <DtCell right>
                      <AdminActionsMenu
                        disabled={busy}
                        actions={[
                          {
                            label: "View info",
                            icon: "view",
                            onClick: () => setViewingSubscription(subscription),
                          },
                          ...(isPending
                            ? [
                                {
                                  label: "Approve",
                                  icon: "edit" as const,
                                  tone: "success" as const,
                                  onClick: () => void handleApproveSubscription(subscription),
                                },
                                {
                                  label: "Reject",
                                  icon: "delete" as const,
                                  tone: "danger" as const,
                                  onClick: () => void handleRejectSubscription(subscription),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </DtCell>
                  </DtRow>
                );
              })}
            </tbody>
          </DtTable>
        )}
      </DataTable>

      <BookingInfoModal booking={viewingBooking} onClose={() => setViewingBooking(null)} />

      {viewingSubscription ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Service request</h2>
              <p className="mt-0.5 text-sm text-slate-500">{viewingSubscription.service_name || "Service"}</p>
            </div>
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Unit</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{viewingSubscription.unit_number || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Requester</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{viewingSubscription.requester_name || "Billing contact"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</dt>
                <dd className="mt-1">
                  <AdminBadge tone={serviceStatusMeta(viewingSubscription.status, viewingSubscription.status_label).tone}>
                    {serviceStatusMeta(viewingSubscription.status, viewingSubscription.status_label).label}
                  </AdminBadge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Note</dt>
                <dd className="mt-0.5 text-slate-700">{viewingSubscription.note || "—"}</dd>
              </div>
              {viewingSubscription.rejection_reason ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Decline reason</dt>
                  <dd className="mt-0.5 text-slate-700">{viewingSubscription.rejection_reason}</dd>
                </div>
              ) : null}
            </dl>
            <div className="flex justify-end border-t border-slate-100 px-5 py-4">
              <button type="button" className="nl-btn-secondary" onClick={() => setViewingSubscription(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
