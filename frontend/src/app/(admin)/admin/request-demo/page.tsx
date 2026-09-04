"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminTableBusy, isAdminSearchPending } from "@/lib/admin/table-loading";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { toastError, toastSuccess } from "@/lib/alert";
import { Archive, Check } from "lucide-react";
import { apiError } from "@/lib/api/client";
import {
  fetchContactSubmission,
  fetchContactSubmissions,
  updateContactSubmission,
  type ContactSubmission,
  type ContactStatus,
} from "@/lib/api/contact";

type StatusFilter = "all" | ContactStatus;

const ROLE_LABELS: Record<ContactSubmission["role"], string> = {
  resident: "Resident",
  admin: "Community admin",
  other: "Board / other",
};

const STATUS_TONES: Record<ContactStatus, "blue" | "green" | "slate"> = {
  new: "blue",
  read: "green",
  archived: "slate",
};

function formatDate(value?: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function RequestDemoPage() {
  const [items, setItems] = useState<ContactSubmission[]>([]);
  const [stats, setStats] = useState({ new: 0, read: 0, archived: 0, total: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [viewing, setViewing] = useState<ContactSubmission | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!hasLoadedOnce.current) {
      setInitialLoading(true);
    } else if (!silent) {
      setRefreshing(true);
    }
    setError(null);
    try {
      const params: Record<string, unknown> = {
        page,
        per_page: ADMIN_TABLE_PAGE_SIZE,
        source: "demo",
      };
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await fetchContactSubmissions(params);
      setItems(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
      setStats(res.meta.stats);
    } catch (err) {
      setError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [debouncedSearch, statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);

  const statusFilters = useMemo(
    () => [
      { key: "all" as StatusFilter, label: "All", count: stats.total },
      { key: "new" as StatusFilter, label: "New", count: stats.new },
      { key: "read" as StatusFilter, label: "Read", count: stats.read },
      { key: "archived" as StatusFilter, label: "Archived", count: stats.archived },
    ],
    [stats],
  );

  const openView = async (item: ContactSubmission) => {
    try {
      const detail = await fetchContactSubmission(item.id);
      setViewing(detail);
      if (detail.status === "new") {
        await handleStatus(detail.id, "read", true);
      }
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleStatus = async (id: number, status: ContactStatus, silent = false) => {
    setBusyId(id);
    try {
      await updateContactSubmission(id, status);
      if (!silent) {
        toastSuccess(
          status === "archived"
            ? "Demo request archived."
            : status === "read"
              ? "Marked as read."
              : "Marked as new.",
        );
      }
      await load(true);
      if (viewing?.id === id) {
        const detail = await fetchContactSubmission(id);
        setViewing(detail);
      }
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusyId(null);
    }
  };

  if (initialLoading) return <PageLoader skeleton />;
  if (error && items.length === 0) return <PageError message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="nl-eyebrow">System Admin</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Request a Demo</h2>
        <p className="mt-1 text-sm text-slate-500">
          Demo requests submitted from the public landing page.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="New Requests"
          value={String(stats.new)}
          hint="Awaiting review"
          tone="blue"
          icon={<IcoInbox />}
        />
        <StatTile
          label="Read Requests"
          value={String(stats.read)}
          hint="Reviewed"
          tone="green"
          icon={<IcoCheck />}
        />
        <StatTile
          label="Archived Requests"
          value={String(stats.archived)}
          hint="Closed out"
          tone="slate"
          icon={<IcoArchive />}
        />
        <StatTile
          label="Total Demo Requests"
          value={String(stats.total)}
          hint="All submissions"
          tone="violet"
          icon={<IcoCalendar />}
        />
      </div>

      <div className="relative">
        <DataTable
          title="Demo Requests"
          totalCount={total}
          visibleCount={items.length}
          search={searchInput}
          onSearch={setSearchInput}
          searching={isSearchPending}
          loading={adminTableBusy(refreshing, busyId !== null)}
          searchPlaceholder="Search name, email, community, note…"
          filters={statusFilters}
          activeFilter={statusFilter}
          onFilter={setStatusFilter}
          isEmpty={items.length === 0}
          empty="No demo requests match your filters."
        >
          <DtTable>
            <DtHead
              cols={[
                { label: "Name" },
                { label: "Email" },
                { label: "Community" },
                { label: "Size" },
                { label: "Preferred time" },
                { label: "Date" },
                { label: "Status" },
                { label: "", right: true },
              ]}
            />
            <tbody>
              {items.map((item) => (
                <DtRow key={item.id} muted={item.status === "archived"}>
                  <DtCell first>
                    <p className="font-semibold text-slate-900">{item.name}</p>
                    <p className="mt-0.5 text-[12px] text-slate-500">{ROLE_LABELS[item.role]}</p>
                  </DtCell>
                  <DtCell nowrap>
                    {item.email}
                  </DtCell>
                  <DtCell>
                    {item.community || "—"}
                  </DtCell>
                  <DtCell nowrap>
                    {item.demo?.community_size || "—"}
                  </DtCell>
                  <DtCell nowrap>
                    {item.demo?.preferred_time || "—"}
                  </DtCell>
                  <DtCell nowrap>
                    {formatDate(item.created_at)}
                  </DtCell>
                  <DtCell nowrap>
                    <AdminBadge tone={STATUS_TONES[item.status]}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                      <AdminActionsMenu
                        actions={[
                          { label: "View", icon: "view", onClick: () => openView(item) },
                        ]}
                      />
                    </div>
                  </DtCell>
                </DtRow>
              ))}
            </tbody>
          </DtTable>
          <DtPagination
            showing={items.length}
            total={total}
            page={page}
            lastPage={lastPage}
            onPageChange={setPage}
          />
        </DataTable>
      </div>

      {viewing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                  Demo request
                </p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">{viewing.name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {ROLE_LABELS[viewing.role]} · {formatDate(viewing.created_at)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setViewing(null)}
                aria-label="Close"
              >
                <IcoClose />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <DetailRow label="Email" value={viewing.email} />
              <DetailRow label="Phone" value={viewing.demo?.phone || "—"} />
              <DetailRow label="Community" value={viewing.community || "—"} />
              <DetailRow label="Size" value={viewing.demo?.community_size || "—"} />
              <DetailRow label="Preferred time" value={viewing.demo?.preferred_time || "—"} />
              <DetailRow label="Status">
                <AdminBadge tone={STATUS_TONES[viewing.status]}>
                  {viewing.status.charAt(0).toUpperCase() + viewing.status.slice(1)}
                </AdminBadge>
              </DetailRow>
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">What they want to see</p>
                <p className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-700">
                  {viewing.demo?.note || viewing.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              {viewing.status !== "read" ? (
                <button
                  type="button"
                  className="nl-btn-secondary"
                  disabled={busyId === viewing.id}
                  onClick={() => handleStatus(viewing.id, "read")}
                >
                  <Check />
                  Mark as read
                </button>
              ) : null}
              {viewing.status !== "archived" ? (
                <button
                  type="button"
                  className="nl-btn-primary"
                  disabled={busyId === viewing.id}
                  onClick={() => handleStatus(viewing.id, "archived")}
                >
                  <Archive />
                  Archive
                </button>
              ) : null}
              <button type="button" className="nl-btn-secondary" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      {children ? (
        <div className="w-fit justify-self-start">{children}</div>
      ) : (
        <p className="text-sm text-slate-800">{value}</p>
      )}
    </div>
  );
}

function IcoInbox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 10h5l2 3h2l2-3h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function IcoCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoArchive() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 8v11a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcoCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IcoClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
