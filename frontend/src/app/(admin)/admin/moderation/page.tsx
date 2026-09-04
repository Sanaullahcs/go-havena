"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { AdminBadge, StatTile, DataTable, DtTable, DtHead, DtRow, DtCell, DtPagination } from "@/components/admin/ui";
import { confirmAction, toastSuccess, toastError } from "@/lib/alert";
import { fetchReports, resolveReport, escalateReport, dismissReport, type Report } from "@/lib/api/reports";
import { apiError } from "@/lib/api/client";
import { PageLoader, PageError } from "@/components/shared/page-states";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { adminTableBusy, isAdminSearchPending, shouldSkipStalePageFetch } from "@/lib/admin/table-loading";

const STATS = [
  { label: "Open Reports",     value: "34",  hint: "12 marked urgent",     tone: "red"   as const, icon: <IcoFlag /> },
  { label: "Resolved (7d)",    value: "127", hint: "+18% vs prior week",   tone: "green" as const, icon: <IcoCheck /> },
  { label: "Avg. Resolution",  value: "4.2h",hint: "Target < 6h",          tone: "blue"  as const, icon: <IcoClock /> },
  { label: "Repeat Offenders", value: "7",   hint: "3 nearing suspension", tone: "amber" as const, icon: <IcoWarn /> },
];

const STATUS_META: Record<string, { tone: "red" | "amber" | "green" | "slate" | "blue"; label: string }> = {
  open:      { tone: "red",   label: "Open"      },
  reviewing: { tone: "blue",  label: "Reviewing" },
  escalated: { tone: "amber", label: "Escalated" },
  resolved:  { tone: "green", label: "Resolved"  },
  dismissed: { tone: "slate", label: "Dismissed" },
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high:   "bg-orange-100 text-orange-700",
  normal: "bg-blue-100 text-blue-700",
  low:    "bg-slate-100 text-slate-500",
};

const TYPE_COLOR: Record<string, string> = {
  Spam:           "#64748b",
  Harassment:     "#dc2626",
  Impersonation:  "#7c3aed",
  Fraud:          "#d97706",
  Misinformation: "#1B4F8A",
  "Hate Speech":  "#be123c",
  Trolling:       "#94a3b8",
  Violence:       "#991b1b",
};

type StatusFilter   = "all" | "open" | "reviewing" | "escalated" | "resolved" | "dismissed";
type PriorityFilter = "all" | "urgent" | "high" | "normal" | "low";

export default function ModerationPage() {
  const [statusFilter, setStatus]     = useState<StatusFilter>("all");
  const [priorityFilter, setPriority] = useState<PriorityFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 450);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);

  const [reports, setReports]   = useState<Report[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);
  const prevFilterKey = useRef(`${statusFilter}|${priorityFilter}|`);

  const load = useCallback(async (silent = false) => {
    if (!hasLoadedOnce.current) setInitialLoading(true);
    else if (!silent) setRefreshing(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { page, per_page: ADMIN_TABLE_PAGE_SIZE };
      if (statusFilter !== "all")   params.status   = statusFilter;
      if (priorityFilter !== "all") params.severity = priorityFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await fetchReports(params);
      setReports(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page ?? 1);
    } catch (err) {
      setError(apiError(err));
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, priorityFilter, debouncedSearch, page]);

  useEffect(() => {
    const filterKey = `${statusFilter}|${priorityFilter}|${debouncedSearch}`;
    if (shouldSkipStalePageFetch(filterKey, page, setPage, prevFilterKey)) return;
    void load();
  }, [statusFilter, priorityFilter, debouncedSearch, page, load]);

  const countStatus = (s: StatusFilter) => s === "all" ? total : reports.filter((r) => r.status === s).length;

  const statusFilters = (["all","open","reviewing","escalated","resolved","dismissed"] as StatusFilter[]).map((s) => ({
    key: s, label: s.charAt(0).toUpperCase() + s.slice(1), count: countStatus(s),
  }));

  const priorityFilters = (["all","urgent","high","normal","low"] as PriorityFilter[]).map((p) => ({
    key: p, label: p.charAt(0).toUpperCase() + p.slice(1),
    count: p === "all" ? undefined : reports.filter((r) => r.severity === p).length,
  }));

  if (initialLoading) return <PageLoader skeleton />;
  if (error)   return <PageError message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="nl-eyebrow">Safety</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Moderation</h2>
          <p className="mt-1 text-sm text-slate-500">Review reports, resolve content issues, and protect community safety.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="nl-btn-secondary"><IcoDownload /> Export</button>
          <button className="nl-btn-primary"><IcoFlag /> Review Queue</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      <DataTable
        title="Report Queue"
        totalCount={total}
        visibleCount={reports.length}
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder="Search by reporter, type, description…"
        searching={isSearchPending}
        loading={adminTableBusy(refreshing, actionLoading)}
        filters={statusFilters}
        activeFilter={statusFilter}
        onFilter={setStatus}
        secondaryFilters={priorityFilters}
        activeSecondary={priorityFilter}
        onSecondary={(k) => setPriority(k as PriorityFilter)}
        isEmpty={reports.length === 0}
        empty="No reports match your filters."
      >
        <DtTable>
          <DtHead cols={[
            { label: "Reporter" },
            { label: "Type" },
            { label: "Description" },
            { label: "Priority" },
            { label: "Status" },
            { label: "Date" },
            { label: "", right: true },
          ]} />
          <tbody>
            {reports.map((r) => {
              const st = STATUS_META[r.status] ?? STATUS_META.open;
              return (
                <DtRow key={r.id} muted={r.status === "dismissed"}>
                  <DtCell first>
                    <span className="font-semibold text-slate-900">{r.reporter_name}</span>
                  </DtCell>
                  <DtCell nowrap>
                    <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-white" style={{ background: TYPE_COLOR[r.type] ?? "#64748b" }}>
                      {r.type}
                    </span>
                  </DtCell>
                  <DtCell>
                    <span className="line-clamp-1 max-w-[280px] text-[12.5px] text-slate-600">{r.description}</span>
                  </DtCell>
                  <DtCell nowrap>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold capitalize ${PRIORITY_STYLE[r.severity] ?? PRIORITY_STYLE.normal}`}>
                      {r.severity}
                    </span>
                  </DtCell>
                  <DtCell nowrap>
                    <AdminBadge tone={st.tone}>{st.label}</AdminBadge>
                  </DtCell>
                  <DtCell nowrap muted>{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      actions={[
                        {
                          label: "Resolve",
                          icon: "approve",
                          tone: "success",
                          hidden: !(r.status === "open" || r.status === "escalated"),
                          onClick: async () => {
                            const res = await confirmAction({ title: "Resolve this report?", text: "The report will be marked as resolved and archived.", confirmText: "Resolve", color: "green" });
                            if (res.isConfirmed) {
                              setActionLoading(true);
                              try { await resolveReport(r.id); toastSuccess("Report resolved successfully."); await load(true); }
                              catch (err) { toastError(apiError(err)); }
                              finally { setActionLoading(false); }
                            }
                          },
                        },
                        {
                          label: "Escalate",
                          icon: "escalate",
                          tone: "warning",
                          hidden: r.status !== "open",
                          onClick: async () => {
                            const res = await confirmAction({ title: "Escalate report?", text: "This will flag it for senior review.", confirmText: "Escalate", icon: "warning", color: "amber" });
                            if (res.isConfirmed) {
                              setActionLoading(true);
                              try { await escalateReport(r.id); toastSuccess("Report escalated to senior moderation."); await load(true); }
                              catch (err) { toastError(apiError(err)); }
                              finally { setActionLoading(false); }
                            }
                          },
                        },
                        {
                          label: "Dismiss",
                          icon: "reject",
                          hidden: !(r.status === "open" || r.status === "reviewing"),
                          onClick: async () => {
                            const res = await confirmAction({ title: "Dismiss this report?", text: "The report will be closed without action.", confirmText: "Dismiss" });
                            if (res.isConfirmed) {
                              setActionLoading(true);
                              try { await dismissReport(r.id); toastSuccess("Report dismissed."); await load(true); }
                              catch (err) { toastError(apiError(err)); }
                              finally { setActionLoading(false); }
                            }
                          },
                        },
                        { label: "View report", icon: "view" },
                      ]}
                    />
                  </DtCell>
                </DtRow>
              );
            })}
          </tbody>
        </DtTable>
        <DtPagination
          showing={reports.length}
          total={total}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </DataTable>
    </div>
  );
}

function IcoFlag()     { return <svg viewBox="0 0 24 24" fill="none"><path d="M4 21V4l1 1 3-2 3 2 3-2 3 2V15l-3-2-3 2-3-2-3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoCheck()    { return <svg viewBox="0 0 20 20" fill="none"><path d="M5 10l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoClock()    { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoWarn()     { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M3 20L12 4l9 16H3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>; }
function IcoDownload() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
