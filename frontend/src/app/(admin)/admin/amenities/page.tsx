"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CalendarPlus, Clock3, MapPin, Plus, Users } from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { AmenityFormModal } from "@/components/admin/amenity-form-modal";
import { AmenityViewModal } from "@/components/admin/amenity-view-modal";
import { AmenityBookModal } from "@/components/admin/amenity-book-modal";
import { AmenityBookingTrackModal } from "@/components/admin/amenity-booking-track-modal";
import { AmenityIcon } from "@/components/admin/amenity-icon";
import {
  AdminBadge,
  DataTable,
  DtCell,
  DtHead,
  DtRow,
  DtTable,
  StatTile,
} from "@/components/admin/ui";
import { getAmenityReviewMeta, getAmenityStatusMeta } from "@/lib/admin/amenity-display";
import { confirmDelete, confirmRejectWithReason, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import {
  approveAmenity,
  createAmenity,
  deleteAmenity,
  fetchAdminAmenities,
  rejectAmenity,
  updateAmenity,
  type Amenity,
} from "@/lib/api/amenities";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { getAdminCache, setAdminCache } from "@/lib/admin/navigation-cache";

type StatusFilter = "all" | "mine" | "my_bookings" | "pending" | "bookable" | "open" | "closed";

type AmenitiesCache = { data: Amenity[]; pendingReview: number };

function bookingStatusBadge(status?: string | null) {
  if (status === "pending") return { label: "Pending", tone: "amber" as const };
  if (status === "rejected") return { label: "Rejected", tone: "red" as const };
  if (status === "confirmed") return { label: "Approved", tone: "green" as const };
  return { label: "Booked", tone: "blue" as const };
}

function formatBookingDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminAmenitiesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cached = getAdminCache<AmenitiesCache>("amenities:list");
  const [amenities, setAmenities] = useState<Amenity[]>(cached?.data ?? []);
  const [pendingReview, setPendingReview] = useState(cached?.pendingReview ?? 0);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewing, setViewing] = useState<Amenity | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Amenity | null>(null);
  const [booking, setBooking] = useState<Amenity | null>(null);
  const [trackingBooking, setTrackingBooking] = useState<Amenity | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setPageError(null);
    try {
      const res = await fetchAdminAmenities();
      setAmenities(res.data);
      setPendingReview(res.pendingReview ?? 0);
      setAdminCache("amenities:list", {
        data: res.data,
        pendingReview: res.pendingReview ?? 0,
      });
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

  useEffect(() => {
    if (searchParams.get("action") === "book") {
      setPickerOpen(true);
    }
  }, [searchParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return amenities.filter((amenity) => {
      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "my_bookings"
            ? Boolean(amenity.user_has_upcoming_booking)
            : statusFilter === "pending"
            ? amenity.review_status === "pending"
            : statusFilter === "mine"
              ? Boolean(amenity.is_mine)
              : amenity.status === statusFilter;
      const matchesSearch =
        !q ||
        amenity.name.toLowerCase().includes(q) ||
        (amenity.description ?? "").toLowerCase().includes(q) ||
        (amenity.floor ?? "").toLowerCase().includes(q) ||
        (amenity.creator_name ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [amenities, search, statusFilter]);

  const stats = useMemo(() => {
    const pending =
      amenities.filter((a) => a.review_status === "pending").length || pendingReview;
    return {
      total: amenities.length,
      mine: amenities.filter((a) => a.is_mine).length,
      myBookings: amenities.filter((a) => a.user_has_upcoming_booking).length,
      pending,
      bookable: amenities.filter((a) => a.status === "bookable").length,
      open: amenities.filter((a) => a.status === "open").length,
      closed: amenities.filter((a) => a.status === "closed").length,
    };
  }, [amenities, pendingReview]);

  const bookableForAdmin = useMemo(
    () =>
      amenities.filter(
        (a) =>
          !a.is_mine &&
          !a.user_has_upcoming_booking &&
          a.review_status === "approved" &&
          (a.status === "bookable" || a.status === "open"),
      ),
    [amenities],
  );

  const filters = useMemo(
    () => [
      { key: "all" as const, label: "All", count: stats.total },
      { key: "mine" as const, label: "Your Amenities", count: stats.mine },
      { key: "my_bookings" as const, label: "My booking", count: stats.myBookings },
      { key: "pending" as const, label: "Need approval", count: stats.pending },
      { key: "bookable" as const, label: "Timed slots", count: stats.bookable },
      { key: "open" as const, label: "Open", count: stats.open },
      { key: "closed" as const, label: "Closed", count: stats.closed },
    ],
    [stats],
  );

  const openCreate = () => {
    setEditing(null);
    setFormMode("create");
  };

  const openEdit = (amenity: Amenity) => {
    if (!amenity.is_mine) {
      toastError("You can only edit amenities you created.");
      return;
    }
    setViewing(null);
    setEditing(amenity);
    setFormMode("edit");
  };

  const closeForm = () => {
    if (submitting) return;
    setFormMode(null);
    setEditing(null);
  };

  const handleSubmit = async (payload: Parameters<typeof createAmenity>[0]) => {
    setSubmitting(true);
    try {
      if (formMode === "edit" && editing) {
        if (!editing.is_mine) {
          toastError("You can only edit amenities you created.");
          return;
        }
        await updateAmenity(editing.id, payload);
        toastSuccess("Amenity updated.");
      } else {
        await createAmenity(payload);
        toastSuccess("Amenity published — no approval needed for community admins.");
      }
      closeForm();
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (amenity: Amenity) => {
    if (!amenity.is_mine) {
      toastError("You can only delete amenities you created.");
      return;
    }
    const confirmed = await confirmDelete({
      title: "Delete amenity?",
      text: `Remove "${amenity.name}" from your community? Residents will no longer see it.`,
    });
    if (!confirmed.isConfirmed) return;

    setSubmitting(true);
    try {
      await deleteAmenity(amenity.id);
      toastSuccess("Amenity deleted.");
      closeForm();
      setViewing(null);
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (amenity: Amenity) => {
    setSubmitting(true);
    try {
      await approveAmenity(amenity.id);
      toastSuccess(`${amenity.name} is now live.`);
      setViewing(null);
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (amenity: Amenity) => {
    const result = await confirmRejectWithReason({
      title: "Reject amenity?",
      text: `Reject "${amenity.name}"? The creator will be notified.`,
      confirmText: "Reject",
    });
    if (!result.isConfirmed) return;

    setSubmitting(true);
    try {
      await rejectAmenity(amenity.id, result.value || undefined);
      toastSuccess("Amenity rejected.");
      setViewing(null);
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && amenities.length === 0) return <PageLoader skeleton />;

  if (pageError && amenities.length === 0) {
    return <PageError message={pageError} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Amenities</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Amenities you create go live immediately. Resident submissions need approval. You can also
            book other residents&apos; amenities from here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="nl-btn-secondary inline-flex items-center gap-2"
          >
            <CalendarPlus className="h-4 w-4" />
            Book amenity
          </button>
          <button type="button" onClick={openCreate} className="nl-btn-primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create amenity
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total facilities" value={String(stats.total)} tone="blue" icon={<Building2 className="h-4 w-4" />} />
        <StatTile label="Need approval" value={String(stats.pending)} tone="amber" icon={<Clock3 className="h-4 w-4" />} />
        <StatTile label="Timed slots" value={String(stats.bookable)} tone="amber" icon={<Users className="h-4 w-4" />} />
        <StatTile label="Open availability" value={String(stats.open)} tone="green" icon={<MapPin className="h-4 w-4" />} />
      </div>

      <DataTable
        title="Community amenities"
        totalCount={amenities.length}
        visibleCount={filtered.length}
        search={search}
        onSearch={setSearch}
        searching={refreshing}
        activeFilter={statusFilter}
        onFilter={(key) => setStatusFilter(key as StatusFilter)}
        filters={filters}
        empty={
          amenities.length === 0
            ? "No amenities yet. Create your first facility to get started."
            : statusFilter === "my_bookings"
              ? "No upcoming bookings yet. Book a facility you don't manage to track it here."
              : "No amenities match your filters."
        }
        isEmpty={filtered.length === 0}
      >
        <DtTable>
          <DtHead
            cols={[
              { label: "Facility" },
              { label: "Status" },
              { label: "Creator" },
              { label: "Capacity" },
              { label: "Hours" },
              { label: "Actions", right: true },
            ]}
          />
          <tbody>
            {filtered.map((amenity) => {
              const status = getAmenityStatusMeta(amenity.status);
              const review = getAmenityReviewMeta(amenity.review_status);
              return (
                <DtRow key={amenity.id}>
                  <DtCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                        <AmenityIcon iconKey={amenity.icon_key} name={amenity.name} size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{amenity.name}</p>
                        {amenity.description ? (
                          <p className="truncate text-xs text-slate-500">{amenity.description}</p>
                        ) : null}
                      </div>
                    </div>
                  </DtCell>
                  <DtCell>
                    <div className="flex flex-wrap gap-1.5">
                      {amenity.user_has_upcoming_booking ? (
                        <AdminBadge tone={bookingStatusBadge(amenity.user_next_booking_status).tone}>
                          {bookingStatusBadge(amenity.user_next_booking_status).label}
                        </AdminBadge>
                      ) : null}
                      {review ? <AdminBadge tone={review.tone}>{review.label}</AdminBadge> : null}
                      <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                    </div>
                  </DtCell>
                  <DtCell>{amenity.creator_name || "—"}</DtCell>
                  <DtCell>{amenity.capacity}</DtCell>
                  <DtCell>
                    <div className="min-w-0">
                      {amenity.user_has_upcoming_booking ? (
                        <p className="font-medium text-blue-700">
                          {formatBookingDate(amenity.user_next_booking_date)}
                          {amenity.user_next_booking_time_slot
                            ? ` · ${amenity.user_next_booking_time_slot}`
                            : ""}
                        </p>
                      ) : (
                        <p>{amenity.hours || "—"}</p>
                      )}
                      <p className="text-xs text-slate-400">
                        {amenity.user_has_upcoming_booking
                          ? amenity.user_next_booking_status === "pending"
                            ? "Waiting for approval"
                            : amenity.user_next_booking_status === "rejected"
                              ? "Booking declined"
                              : "Upcoming reservation"
                          : amenity.weekends_available === false
                            ? "Weekdays only"
                            : "Includes weekends"}
                        {!amenity.user_has_upcoming_booking &&
                        amenity.status === "bookable" &&
                        amenity.slot_duration_minutes
                          ? ` · ${amenity.slot_duration_minutes}m slots`
                          : ""}
                      </p>
                    </div>
                  </DtCell>
                  <DtCell right>
                    <AdminActionsMenu
                      actions={[
                        { label: "View", icon: "view", onClick: () => setViewing(amenity) },
                        ...(amenity.user_has_upcoming_booking
                          ? [
                              {
                                label: "Track booking",
                                icon: "view" as const,
                                onClick: () => setTrackingBooking(amenity),
                              },
                            ]
                          : []),
                        ...(!amenity.is_mine &&
                        amenity.review_status === "approved" &&
                        (amenity.status === "bookable" || amenity.status === "open")
                          ? amenity.user_has_upcoming_booking
                            ? [
                                {
                                  label: "Already booked",
                                  icon: "view" as const,
                                  disabled: true,
                                },
                              ]
                            : [
                                {
                                  label: "Book",
                                  icon: "edit" as const,
                                  onClick: () => setBooking(amenity),
                                },
                              ]
                          : []),
                        ...(amenity.review_status === "pending"
                          ? [
                              {
                                label: "Approve",
                                icon: "edit" as const,
                                onClick: () => void handleApprove(amenity),
                              },
                              {
                                label: "Reject",
                                icon: "delete" as const,
                                tone: "danger" as const,
                                onClick: () => void handleReject(amenity),
                              },
                            ]
                          : []),
                        ...(amenity.is_mine
                          ? [
                              {
                                label: "Edit",
                                icon: "edit" as const,
                                onClick: () => openEdit(amenity),
                              },
                              {
                                label: "Delete",
                                icon: "delete" as const,
                                tone: "danger" as const,
                                onClick: () => void handleDelete(amenity),
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

      <AmenityViewModal
        amenity={viewing}
        onClose={() => setViewing(null)}
        onEdit={viewing?.is_mine ? (amenity) => openEdit(amenity) : undefined}
        onApprove={
          viewing?.review_status === "pending" ? () => void handleApprove(viewing) : undefined
        }
        onReject={
          viewing?.review_status === "pending" ? () => void handleReject(viewing) : undefined
        }
        onManageRequests={
          viewing?.is_mine
            ? () => {
                setViewing(null);
                router.push("/admin/bookings");
              }
            : undefined
        }
      />

      <AmenityFormModal
        open={formMode !== null}
        mode={formMode === "edit" ? "edit" : "create"}
        amenity={editing}
        submitting={submitting}
        onClose={closeForm}
        onSubmit={handleSubmit}
        onDelete={editing?.is_mine ? () => handleDelete(editing) : undefined}
      />

      <AmenityBookModal
        amenity={booking}
        onClose={() => setBooking(null)}
        onBooked={() => void load(true)}
      />

      <AmenityBookingTrackModal
        amenity={trackingBooking}
        onClose={() => setTrackingBooking(null)}
      />

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Book an amenity</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Choose a community amenity you did not create. The creator will approve your request.
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {bookableForAdmin.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No bookable amenities available right now.
                </p>
              ) : (
                bookableForAdmin.map((amenity) => {
                  const status = getAmenityStatusMeta(amenity.status);
                  return (
                    <button
                      key={amenity.id}
                      type="button"
                      onClick={() => {
                        setPickerOpen(false);
                        setBooking(amenity);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left transition hover:border-[rgba(20, 184, 166, 0.28)] hover:bg-[#F8FAFF]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                        <AmenityIcon iconKey={amenity.icon_key} name={amenity.name} size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">{amenity.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {amenity.hours || "Hours TBD"}
                          {amenity.creator_name ? ` · ${amenity.creator_name}` : ""}
                        </p>
                      </div>
                      <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex justify-end border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="nl-btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
