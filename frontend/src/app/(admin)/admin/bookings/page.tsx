"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Check, Clock3, X } from "lucide-react";
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
import { PageError, PageLoader } from "@/components/shared/page-states";
import { getAdminCache, setAdminCache } from "@/lib/admin/navigation-cache";

type StatusFilter = "all" | "pending" | "confirmed" | "rejected";

const STATUS_META: Record<string, { label: string; tone: "amber" | "green" | "red" | "slate" }> = {
  pending: { label: "Pending", tone: "amber" },
  confirmed: { label: "Approved", tone: "green" },
  rejected: { label: "Declined", tone: "red" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export default function AdminBookingsPage() {
  const cached = getAdminCache<Booking[]>("bookings:inbox");
  const [bookings, setBookings] = useState<Booking[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<Booking | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setPageError(null);
    try {
      const data = await fetchBookingInbox();
      setBookings(data);
      setAdminCache("bookings:inbox", data);
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

  const stats = useMemo(() => {
    const pending = bookings.filter((b) => b.status === "pending").length;
    const confirmed = bookings.filter((b) => b.status === "confirmed").length;
    const rejected = bookings.filter((b) => b.status === "rejected").length;
    return { total: bookings.length, pending, confirmed, rejected };
  }, [bookings]);

  const filters = useMemo(
    () => [
      { key: "pending" as const, label: "Pending", count: stats.pending },
      { key: "confirmed" as const, label: "Approved", count: stats.confirmed },
      { key: "rejected" as const, label: "Declined", count: stats.rejected },
      { key: "all" as const, label: "All", count: stats.total },
    ],
    [stats],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((booking) => {
      const matchesStatus = statusFilter === "all" || booking.status === statusFilter;
      const matchesSearch =
        !q ||
        booking.amenity_name.toLowerCase().includes(q) ||
        (booking.user_name ?? "").toLowerCase().includes(q) ||
        (booking.user_unit ?? "").toLowerCase().includes(q) ||
        (booking.time_slot ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [bookings, search, statusFilter]);

  const handleApprove = async (booking: Booking) => {
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

  const handleReject = async (booking: Booking) => {
    const result = await confirmRejectWithReason({
      title: "Decline booking?",
      text: `Decline ${booking.user_name ?? "resident"}'s request for ${booking.amenity_name}?`,
      confirmText: "Decline",
    });
    if (!result.isConfirmed) return;

    setBusyId(booking.id);
    try {
      await rejectBooking(booking.id, result.value || undefined);
      toastSuccess("Booking declined.");
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && bookings.length === 0) return <PageLoader skeleton />;

  if (pageError && bookings.length === 0) {
    return <PageError message={pageError} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Booking Request</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Review booking requests for amenities you created. Only the amenity creator can approve or
          decline reservations.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Inbox total" value={String(stats.total)} tone="blue" icon={<CalendarCheck2 className="h-4 w-4" />} />
        <StatTile label="Pending" value={String(stats.pending)} tone="amber" icon={<Clock3 className="h-4 w-4" />} />
        <StatTile label="Approved" value={String(stats.confirmed)} tone="green" icon={<Check className="h-4 w-4" />} />
        <StatTile label="Declined" value={String(stats.rejected)} tone="red" icon={<X className="h-4 w-4" />} />
      </div>

      <DataTable
        title="Booking inbox"
        totalCount={bookings.length}
        visibleCount={filtered.length}
        search={search}
        onSearch={setSearch}
        searching={refreshing}
        activeFilter={statusFilter}
        onFilter={(key) => setStatusFilter(key as StatusFilter)}
        filters={filters}
        empty={
          bookings.length === 0
            ? "No booking requests yet for amenities you created."
            : "No bookings match your filters."
        }
        isEmpty={filtered.length === 0}
      >
        <DtTable>
          <DtHead
            cols={[
              { label: "Facility" },
              { label: "Resident" },
              { label: "When" },
              { label: "Guests" },
              { label: "Status" },
              { label: "Actions", right: true },
            ]}
          />
          <tbody>
            {filtered.map((booking) => {
              const status = STATUS_META[booking.status] ?? STATUS_META.pending;
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
                        <p className="truncate text-xs text-slate-500">
                          {booking.time_slot || "Open access request"}
                        </p>
                      </div>
                    </div>
                  </DtCell>
                  <DtCell>
                    <p className="font-medium text-slate-900">{booking.user_name || "Resident"}</p>
                    <p className="text-xs text-slate-500">{booking.user_unit || "—"}</p>
                  </DtCell>
                  <DtCell>{booking.date}</DtCell>
                  <DtCell>{booking.guests}</DtCell>
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
                          onClick: () => setViewing(booking),
                        },
                        ...(isPending
                          ? [
                              {
                                label: "Approve",
                                icon: "edit" as const,
                                tone: "success" as const,
                                onClick: () => void handleApprove(booking),
                              },
                              {
                                label: "Reject",
                                icon: "delete" as const,
                                tone: "danger" as const,
                                onClick: () => void handleReject(booking),
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
      </DataTable>

      <BookingInfoModal booking={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
