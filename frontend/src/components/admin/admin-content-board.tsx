"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { AdminBadge, StatTile, DataTable, DtTable, DtHead, DtRow, DtCell, DtPagination } from "@/components/admin/ui";
import NoticeFormModal from "@/components/admin/notice-form-modal";
import NoticeViewModal from "@/components/admin/notice-view-modal";
import { confirmAction, confirmDelete, confirmRejectWithReason, toastSuccess, toastError } from "@/lib/alert";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminTableBusy, isAdminSearchPending } from "@/lib/admin/table-loading";
import {
  fetchAdminNotices,
  fetchNotice,
  createNotice,
  createEvent,
  createAlert,
  updateNotice,
  deleteNotice,
  approveNotice,
  rejectNotice,
  categoryLabel,
  NOTICE_CATEGORIES,
  type Notice,
  type NoticeFormData,
  type NoticeStats,
} from "@/lib/api/notices";
import { apiError } from "@/lib/api/client";
import { getManagedCommunityId, isSystemAdminUser } from "@/lib/auth/session";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { isEventSchedulePast } from "@/lib/admin/event-schedule";
import { PageLoader, PageError } from "@/components/shared/page-states";

export type ContentBoardKind = "notices" | "events" | "alerts";

type BoardFilter = "all" | "draft" | "scheduled" | "published" | "pending" | "rejected";

const EMPTY_STATS: NoticeStats = {
  total: 0,
  published: 0,
  draft: 0,
  scheduled: 0,
  archived: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
};

const STATUS_META: Record<string, { tone: "green" | "amber" | "blue" | "slate"; label: string }> = {
  published: { tone: "green", label: "Published" },
  draft:     { tone: "amber", label: "Draft" },
  archived:  { tone: "slate", label: "Archived" },
};

function publishStatusMeta(notice: Notice) {
  if (notice.review_status === "pending") {
    return { tone: "amber" as const, label: "Pending" };
  }
  if (notice.review_status === "rejected") {
    return { tone: "red" as const, label: "Rejected" };
  }
  if (notice.status === "draft" && notice.scheduled_at) {
    const scheduled = new Date(notice.scheduled_at.includes("T") ? notice.scheduled_at : notice.scheduled_at.replace(" ", "T"));
    if (!Number.isNaN(scheduled.getTime()) && scheduled.getTime() > Date.now()) {
      return { tone: "blue" as const, label: "Scheduled for later" };
    }
    if (!Number.isNaN(scheduled.getTime()) && scheduled.getTime() <= Date.now()) {
      return { tone: "amber" as const, label: "Publishing…" };
    }
  }
  return STATUS_META[notice.status] ?? STATUS_META.draft;
}

function audienceMeta(notice: Notice) {
  if (notice.audience_type === "selected") {
    const recipients = notice.recipients ?? [];
    if (recipients.length === 1) {
      return { tone: "violet" as const, label: recipients[0].name };
    }
    if (recipients.length > 1) {
      return { tone: "violet" as const, label: `${recipients.length} residents` };
    }
    const count = notice.recipient_user_ids?.length ?? 0;
    return {
      tone: "violet" as const,
      label: count > 0 ? `${count} resident${count === 1 ? "" : "s"}` : "Specific residents",
    };
  }
  return { tone: "blue" as const, label: "All residents" };
}

// const REVIEW_META: Record<string, { tone: "green" | "amber" | "red"; label: string }> = {
//   pending:  { tone: "amber", label: "Pending" },
//   approved: { tone: "green", label: "Approved" },
//   rejected: { tone: "red",   label: "Rejected" },
// };

const CAT_COLOR: Record<string, string> = {
  general:     "#64748b",
  emergency:   "#dc2626",
  event:       "#7c3aed",
  maintenance: "#d97706",
  security:    "#1B4F8A",
  finance:     "#059669",
};

const BOARD_CONFIG: Record<ContentBoardKind, {
  title: string;
  subtitle: string;
  createLabel: string;
  categoryGroup: string;
  defaultCategory: string;
  lockedCategory?: string;
}> = {
  notices: {
    title: "Notices",
    subtitle: "Review and publish community announcements. Community admins submit items for approval.",
    createLabel: "Create Notice",
    categoryGroup: "notices",
    defaultCategory: "general",
  },
  events: {
    title: "Events",
    subtitle: "Manage community events. Approve resident submissions or publish directly.",
    createLabel: "Create Event",
    categoryGroup: "events",
    defaultCategory: "event",
    lockedCategory: "event",
  },
  alerts: {
    title: "Alerts",
    subtitle: "Manage emergency alerts and urgent notices for communities.",
    createLabel: "Create Alert",
    categoryGroup: "alerts",
    defaultCategory: "emergency",
    lockedCategory: "emergency",
  },
};

function formatEventSchedule(notice: Notice): string {
  if (!notice.event_date && !notice.event_time && !notice.event_time_end) return "—";
  const datePart = notice.event_date
    ? new Date(`${String(notice.event_date).slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
  const formatTime = (time: string) =>
    time.slice(0, 5).replace(/^(\d{2}):(\d{2})$/, (_, h, m) => {
      const hour = Number(h);
      const suffix = hour >= 12 ? "PM" : "AM";
      const display = hour % 12 || 12;
      return `${display}:${m} ${suffix}`;
    });
  let timePart = "";
  if (notice.event_time && notice.event_time_end) {
    timePart = `${formatTime(notice.event_time)} – ${formatTime(notice.event_time_end)}`;
  } else if (notice.event_time) {
    timePart = formatTime(notice.event_time);
  } else if (notice.event_time_end) {
    timePart = formatTime(notice.event_time_end);
  }
  return [datePart, timePart].filter(Boolean).join(" · ");
}

function formatEventAttendance(notice: Notice): string {
  if (notice.category !== "event") return "—";
  const count = notice.rsvp_count ?? 0;
  const waitlist = notice.waitlist_count ?? 0;
  const waitlistSuffix = waitlist > 0 ? ` · ${waitlist} waiting` : "";
  if (notice.event_capacity != null) {
    const suffix = notice.is_full ? " · Full" : "";
    return `${count} / ${notice.event_capacity}${suffix}${waitlistSuffix}`;
  }
  return count > 0 ? `${count} going${waitlistSuffix}` : waitlist > 0 ? `${waitlist} waiting` : "0 going";
}

function itemTypeLabel(kind: ContentBoardKind): string {
  if (kind === "events") return "event";
  if (kind === "alerts") return "alert";
  return "notice";
}

export default function AdminContentBoard({ kind }: { kind: ContentBoardKind }) {
  const config = BOARD_CONFIG[kind];
  const showPendingReview = kind === "events";
  const searchParams = useSearchParams();
  const reviewParam = searchParams.get("review_status");
  const statusParam = searchParams.get("status");
  const initialFilter: BoardFilter =
    reviewParam === "pending" && showPendingReview
      ? "pending"
      : reviewParam === "rejected" && showPendingReview
        ? "rejected"
        : statusParam === "draft" || statusParam === "scheduled" || statusParam === "published"
          ? statusParam
          : reviewParam === "approved"
            ? "published"
            : "all";
  const highlightNoticeId = searchParams.get("notice");

  const [boardFilter, setBoardFilter] = useState<BoardFilter>(
    (["all", "draft", "scheduled", "published", "pending", "rejected"] as BoardFilter[]).includes(initialFilter)
      ? initialFilter
      : "all",
  );
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [viewing, setViewing] = useState<Notice | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [stats, setStats] = useState<NoticeStats>(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const hasLoadedOnce = useRef(false);
  const openedNoticeRef = useRef<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!hasLoadedOnce.current) setInitialLoading(true);
    else if (!silent) setRefreshing(true);
    setError(null);
    try {
      const scopedCommunityId = isSystemAdminUser() ? "all" : getManagedCommunityId();
      const params: Record<string, unknown> = {
        page,
        per_page: ADMIN_TABLE_PAGE_SIZE,
        ...(scopedCommunityId ? { community_id: scopedCommunityId } : { community_id: "all" }),
        category_group: config.categoryGroup,
      };
      if (boardFilter === "pending") {
        params.review_status = "pending";
      } else if (boardFilter === "rejected") {
        params.review_status = "rejected";
      } else if (boardFilter === "scheduled") {
        params.status = "scheduled";
      } else if (boardFilter !== "all") {
        params.status = boardFilter;
      }
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await fetchAdminNotices(params);
      setNotices(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
      if (res.meta.stats) setStats({ ...EMPTY_STATS, ...res.meta.stats });
    } catch (err) {
      setError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [config.categoryGroup, boardFilter, debouncedSearch, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setPage(1);
  }, [boardFilter, debouncedSearch]);

  useEffect(() => {
    const id = highlightNoticeId?.trim();
    if (!id || openedNoticeRef.current === id) return;

    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) return;

    const fromList = notices.find((notice) => notice.id === numericId);
    if (fromList) {
      openedNoticeRef.current = id;
      setViewing(fromList);
      return;
    }

    if (!hasLoadedOnce.current) return;

    let cancelled = false;
    void fetchNotice(numericId)
      .then((notice) => {
        if (cancelled) return;
        openedNoticeRef.current = id;
        setViewing(notice);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [highlightNoticeId, notices]);

  const statTiles = useMemo(() => {
    const tiles = [
      { label: "Total", value: String(stats.total), hint: "All items", tone: "violet" as const, icon: <IcoDoc /> },
    ];
    if (showPendingReview) {
      tiles.push({
        label: "Pending",
        value: String(stats.pending ?? 0),
        hint: "Awaiting approval",
        tone: "amber" as const,
        icon: <IcoClock />,
      });
    }
    tiles.push(
      { label: "Published", value: String(stats.published), hint: "Live to residents", tone: "green" as const, icon: <IcoCheck /> },
    );
    if (showPendingReview) {
      tiles.push({
        label: "Rejected",
        value: String(stats.rejected ?? 0),
        hint: "Declined submissions",
        tone: "red" as const,
        icon: <IcoBan />,
      });
    } else {
      tiles.push({
        label: "Draft",
        value: String(stats.draft),
        hint: "Saved, not published",
        tone: "amber" as const,
        icon: <IcoDoc />,
      });
    }
    tiles.push({
      label: "Scheduled for later",
      value: String(stats.scheduled ?? 0),
      hint: "Queued to publish",
      tone: "blue" as const,
      icon: <IcoClock />,
    });
    return tiles;
  }, [stats, showPendingReview]);

  const boardFilters = useMemo(() => {
    const keys: BoardFilter[] = showPendingReview
      ? ["all", "pending", "rejected", "draft", "scheduled", "published"]
      : ["all", "draft", "scheduled", "published"];
    return keys.map((s) => ({
      key: s,
      label:
        s === "all"
          ? "All"
          : s === "pending"
            ? "Pending"
            : s === "rejected"
              ? "Rejected"
              : s === "draft"
                ? "Draft"
                : s === "scheduled"
                  ? "Scheduled for later"
                  : "Published",
      count:
        s === "all"
          ? stats.total
          : s === "pending"
            ? (stats.pending ?? 0)
            : s === "rejected"
              ? (stats.rejected ?? 0)
              : s === "scheduled"
                ? (stats.scheduled ?? 0)
                : stats[s],
    }));
  }, [stats, showPendingReview]);

  const handleSubmit = async (values: NoticeFormData) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        category: config.lockedCategory ?? values.category,
        ...(isSystemAdminUser() ? { as_platform_admin: true } : {}),
      };
      if (modalMode === "edit" && editing) {
        await updateNotice(editing.id, payload);
        toastSuccess("Updated successfully.");
      } else if (kind === "events") {
        await createEvent(payload);
        toastSuccess(payload.scheduled_at ? "Event scheduled!" : "Event published!");
      } else if (kind === "alerts") {
        await createAlert(payload);
        toastSuccess(payload.scheduled_at ? "Alert scheduled!" : "Alert published!");
      } else {
        await createNotice(payload);
        toastSuccess(payload.scheduled_at ? "Notice scheduled!" : "Notice published!");
      }
      setModalMode(null);
      setEditing(null);
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (id: number, fn: () => Promise<void>) => {
    if (actionId !== null) return;
    setActionId(id);
    try {
      await fn();
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActionId(null);
    }
  };

  if (initialLoading) return <PageLoader skeleton />;
  if (error && notices.length === 0) return <PageError message={error} onRetry={() => load()} />;

  const tableColumns = kind === "events"
    ? [
        { label: "Title" },
        { label: "Community" },
        { label: "Schedule" },
        { label: "Attendance" },
        // { label: "Audience" },
        { label: "Author" },
        // { label: "Review" },
        { label: "Status" },
        { label: "", right: true },
      ]
    : [
        { label: "Title" },
        { label: "Community" },
        { label: "Category" },
        { label: "Schedule" },
        { label: "Audience" },
        { label: "Author" },
        // { label: "Review" },
        { label: "Status" },
        { label: "", right: true },
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Community</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{config.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{config.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(null); setModalMode("create"); }}
          className="nl-btn-primary"
          disabled={submitting}
        >
          <IcoPlus /> {config.createLabel}
        </button>
      </div>

      <div className={`grid gap-3 sm:grid-cols-2 ${showPendingReview ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-4"}`}>
        {statTiles.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      <DataTable
        title={`All ${config.title}`}
        totalCount={total}
        visibleCount={notices.length}
        search={searchInput}
        onSearch={setSearchInput}
        searching={isSearchPending}
        loading={adminTableBusy(refreshing, actionId !== null, submitting)}
        searchPlaceholder="Search title, community, author…"
        filters={boardFilters}
        activeFilter={boardFilter}
        onFilter={(key) => setBoardFilter(key as BoardFilter)}
        isEmpty={notices.length === 0}
        empty="No items match your filters."
      >
        <DtTable>
          <DtHead cols={tableColumns} />
          <tbody>
            {notices.map((n) => {
              const st = publishStatusMeta(n);
              // const rv = REVIEW_META[n.review_status] ?? REVIEW_META.pending;
              const audience = audienceMeta(n);
              const busy = actionId === n.id;
              return (
                <DtRow key={n.id} muted={n.review_status === "rejected"}>
                  <DtCell first>
                    <div className="min-w-0">
                      <p className="max-w-xs font-semibold text-slate-900 line-clamp-1">{n.title}</p>
                      {n.is_global && (
                        <span className="mt-0.5 inline-block text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                          All communities
                        </span>
                      )}
                    </div>
                  </DtCell>
                  <DtCell nowrap muted>{n.community_name ?? "—"}</DtCell>
                  {kind === "events" ? (
                    <DtCell nowrap muted>{formatEventSchedule(n)}</DtCell>
                  ) : (
                    <DtCell nowrap><CategoryChip category={n.category} /></DtCell>
                  )}
                  {kind === "events" ? (
                    <DtCell nowrap>
                      <span className={n.is_full ? "font-semibold text-red-600" : "text-slate-600"}>
                        {formatEventAttendance(n)}
                      </span>
                    </DtCell>
                  ) : (
                    <DtCell nowrap muted>{formatEventSchedule(n)}</DtCell>
                  )}
                  {kind !== "events" ? (
                    <DtCell nowrap>
                      <AdminBadge tone={audience.tone}>{audience.label}</AdminBadge>
                    </DtCell>
                  ) : null}
                  {/* Events: Audience column commented out */}
                  <DtCell nowrap muted>{n.author_name}</DtCell>
                  {/* <DtCell nowrap><AdminBadge tone={rv.tone}>{rv.label}</AdminBadge></DtCell> */}
                  <DtCell nowrap><AdminBadge tone={st.tone}>{st.label}</AdminBadge></DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      disabled={busy}
                      actions={[
                        {
                          label: "Publish",
                          icon: "approve",
                          tone: "primary",
                          hidden: n.status !== "draft" || n.review_status !== "approved",
                          onClick: () => runAction(n.id, async () => {
                            const label = itemTypeLabel(kind);
                            const r = await confirmAction({
                              title: `Publish this ${label} now?`,
                              text: "It will go live to residents immediately.",
                              confirmText: "Publish",
                              color: "blue",
                            });
                            if (r.isConfirmed) {
                              await updateNotice(n.id, { status: "published", scheduled_at: null });
                              toastSuccess("Published!");
                            }
                          }),
                        },
                        { label: "View", icon: "view", onClick: () => setViewing(n) },
                        {
                          label: "Edit",
                          icon: "edit",
                          hidden: kind === "events" && isEventSchedulePast(n),
                          onClick: () => { setEditing(n); setModalMode("edit"); },
                        },
                        {
                          label: "Approve",
                          icon: "approve",
                          tone: "primary",
                          hidden: n.review_status !== "pending",
                          onClick: () => runAction(n.id, async () => {
                            const r = await confirmAction({ title: "Approve this item?", text: "It will be published to the community.", confirmText: "Approve", color: "blue" });
                            if (r.isConfirmed) {
                              await approveNotice(n.id);
                              toastSuccess("Approved and published!");
                            }
                          }),
                        },
                        {
                          label: "Reject",
                          icon: "ban",
                          tone: "danger",
                          hidden: n.review_status !== "pending",
                          onClick: () => runAction(n.id, async () => {
                            const r = await confirmRejectWithReason({
                              title: "Reject this item?",
                              text: "A reason is required. The author will be notified.",
                              confirmText: "Reject",
                            });
                            if (r.isConfirmed) {
                              await rejectNotice(n.id, String(r.value ?? "").trim());
                              toastSuccess("Rejected.");
                              if (viewing?.id === n.id) {
                                const updated = await fetchNotice(n.id);
                                setViewing(updated);
                              }
                            }
                          }),
                        },
                        {
                          label: "Re-approve",
                          icon: "approve",
                          tone: "success",
                          hidden: n.review_status !== "rejected",
                          onClick: () => runAction(n.id, async () => {
                            const label = itemTypeLabel(kind);
                            const r = await confirmAction({
                              title: `Re-approve this ${label}?`,
                              text: "It will be published to the community.",
                              confirmText: "Re-approve",
                              color: "blue",
                            });
                            if (r.isConfirmed) {
                              await approveNotice(n.id);
                              toastSuccess("Re-approved and published!");
                            }
                          }),
                        },
                        {
                          label: "Delete",
                          icon: "delete",
                          tone: "danger",
                          onClick: () => runAction(n.id, async () => {
                            const r = await confirmDelete({ title: "Delete this item?", confirmText: "Delete" });
                            if (r.isConfirmed) {
                              await deleteNotice(n.id);
                              toastSuccess("Deleted.");
                            }
                          }),
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
          showing={notices.length}
          total={total}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </DataTable>

      <NoticeViewModal
        notice={viewing}
        onClose={() => setViewing(null)}
        onEdit={
          viewing && kind === "events" && isEventSchedulePast(viewing)
            ? undefined
            : (notice) => { setViewing(null); setEditing(notice); setModalMode("edit"); }
        }
      />

      <NoticeFormModal
        open={modalMode !== null}
        mode={modalMode === "edit" ? "edit" : "create"}
        initial={editing}
        submitting={submitting}
        onClose={() => { setModalMode(null); setEditing(null); }}
        onSubmit={handleSubmit}
        defaultCategory={config.defaultCategory}
        lockedCategory={config.lockedCategory}
      />
    </div>
  );
}

function CategoryChip({ category }: { category: string }) {
  const color = CAT_COLOR[category] ?? "#64748b";
  return (
    <span className="inline-flex h-6 min-w-[5.5rem] items-center justify-center rounded-full px-3 text-[11px] font-semibold leading-none text-white" style={{ background: color }}>
      {categoryLabel(category)}
    </span>
  );
}

function IcoDoc()   { return <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoCheck() { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoClock() { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoPlus()  { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoBan()   { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M7 7l10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
