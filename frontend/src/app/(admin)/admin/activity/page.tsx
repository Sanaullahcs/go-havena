"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPanel, DtPagination, StatTile } from "@/components/admin/ui";
import { ActivityLogRow, SEV_CONFIG } from "@/components/admin/activity/activity-log-row";
import { DashboardEmptyState, DashboardHero } from "@/components/admin/dashboard/dashboard-shared";
import { PageLoader } from "@/components/shared/page-states";
import {
  fetchActivityLogStats,
  fetchActivityLogs,
  relLogTime,
  type ActivityLog,
  type ActivityLogStats,
  type ActivityLogType,
  type ActivitySeverity,
} from "@/lib/api/activity-logs";
import { NL } from "@/lib/design-tokens";
import { toastInfo, toastSuccess } from "@/lib/alert";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

type SeverityFilter = ActivitySeverity | "all";

export default function ActivityLogsPage() {
  const [tab, setTab] = useState<ActivityLogType>("user");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<ActivityLogStats | null>(null);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const [logsRes, statsRes] = await Promise.all([
          fetchActivityLogs({
            type: tab,
            severity,
            search: debouncedSearch,
            page,
            perPage: ADMIN_TABLE_PAGE_SIZE,
          }),
          fetchActivityLogStats().catch(() => null),
        ]);

        setLogs(logsRes.data);
        setTotal(logsRes.total);
        setLastPage(logsRes.last_page);
        if (statsRes) setStats(statsRes);
      } catch {
        setLogs([]);
        setTotal(0);
        setLastPage(1);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab, severity, debouncedSearch, page],
  );

  useEffect(() => {
    load();
  }, [load]);

  const statCards = useMemo(
    () => [
      {
        label: "Today",
        value: String(stats?.today_total ?? 0),
        hint: `${stats?.user_total ?? 0} user · ${stats?.system_total ?? 0} system`,
        tone: "blue" as const,
        icon: <IcoActivity />,
      },
      {
        label: "Warnings",
        value: String(stats?.warnings ?? 0),
        hint: "Needs attention",
        tone: "amber" as const,
        icon: <IcoWarning />,
      },
      {
        label: "Errors",
        value: String((stats?.errors ?? 0) + (stats?.critical ?? 0)),
        hint: `${stats?.critical ?? 0} critical`,
        tone: "red" as const,
        icon: <IcoAlert />,
      },
      {
        label: "Last Activity",
        value: stats?.last_log ? relLogTime(stats.last_log.created_at) : "—",
        hint: stats?.last_log
          ? `${stats.last_log.user_name ?? "System"} · ${stats.last_log.action.replace(/_/g, " ")}`
          : "No activity yet",
        tone: "green" as const,
        icon: <IcoClock />,
      },
    ],
    [stats],
  );

  const severityOptions: SeverityFilter[] = ["all", "info", "warning", "error", "critical"];

  if (loading && !refreshing) return <PageLoader skeleton />;

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Administration"
        title="Activity Logs"
        description="Full audit trail of user actions and system events across the platform."
        variant="system"
        refreshing={refreshing}
        onRefresh={() => load(true)}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <StatTile key={card.label} {...card} />
        ))}
      </div>

      <AdminPanel
        title="Audit Trail"
        description="Filter by actor type, severity, or search keywords."
        action={
          <div className="flex items-center gap-2">
            <button type="button" className="nl-btn-secondary" onClick={() => toastSuccess("Log export started. File will be emailed to you.")}>
              <IcoDownload /> Export
            </button>
            <button type="button" className="nl-btn-primary" onClick={() => toastInfo("Live streaming available in the Pro plan.")}>
              <IcoStream /> Live
            </button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {(["user", "system"] as ActivityLogType[]).map((type) => {
            const count = type === "user" ? stats?.user_total ?? 0 : stats?.system_total ?? 0;
            const active = tab === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setTab(type);
                  setPage(1);
                  setSeverity("all");
                }}
                className={[
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition",
                  active ? "text-white shadow-md" : "border bg-white",
                ].join(" ")}
                style={
                  active
                    ? { background: NL.fillCta, boxShadow: "0 4px 12px rgba(20, 184, 166, 0.22)" }
                    : { borderColor: NL.borderCard, color: NL.textSecondary }
                }
              >
                {type === "user" ? <IcoUser /> : <IcoServer />}
                {type === "user" ? "User Activity" : "System Activity"}
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    background: active ? "rgba(255,255,255,0.18)" : NL.chipBg,
                    color: active ? "#fff" : NL.brandPrimaryDeep,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border p-3" style={{ borderColor: NL.borderCard, background: NL.surfaceMuted }}>
          <div className="relative min-w-[200px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <IcoSearch />
            </span>
            <input
              type="search"
              placeholder={`Search ${tab} activity…`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="nl-input h-10 rounded-xl pl-9 text-[13px]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {severityOptions.map((option) => {
              const active = severity === option;
              const sev = option !== "all" ? SEV_CONFIG[option] : null;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSeverity(option);
                    setPage(1);
                  }}
                  className={[
                    "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11.5px] font-semibold transition",
                    active && option === "all" ? "border-transparent text-white" : "",
                    !active ? "bg-white" : "",
                  ].join(" ")}
                  style={
                    active
                      ? option === "all"
                        ? { background: NL.brandPrimaryDeep, borderColor: NL.brandPrimaryDeep }
                        : { background: sev?.color, borderColor: sev?.color, color: "#fff" }
                      : { borderColor: NL.borderCard, color: NL.textSecondary }
                  }
                >
                  {option !== "all" ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: active ? "#fff" : sev?.dot }}
                    />
                  ) : null}
                  {option === "all" ? "All" : SEV_CONFIG[option].label}
                </button>
              );
            })}
          </div>
        </div>

        {logs.length === 0 ? (
          <DashboardEmptyState
            title="No activity logs found"
            description="Try changing filters or search terms to see more events."
          />
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <ActivityLogRow key={log.id} log={log} />
            ))}
          </div>
        )}

        <DtPagination
          showing={logs.length}
          total={total}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
          pageSize={ADMIN_TABLE_PAGE_SIZE}
        />
      </AdminPanel>
    </div>
  );
}

function IcoActivity() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M1.5 8h2.5l2-5 2.5 8.5L11 5.5l1.5 3.5H14.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IcoWarning() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3.5L13.5 13H2.5L8 3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 7v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IcoAlert() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IcoClock() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IcoUser() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 13c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IcoServer() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="3" width="13" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="9" width="13" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function IcoSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IcoDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IcoStream() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.5" fill="currentColor" />
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 2" />
    </svg>
  );
}
