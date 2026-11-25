"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { ActivityLogRow } from "@/components/admin/activity/activity-log-row";
import { DtPagination } from "@/components/admin/ui";
import { fetchCommunityActivityLogs, fetchCommunityAdminActivityLogs, type ActivityLog } from "@/lib/api/activity-logs";
import { apiError } from "@/lib/api/client";
import { NL } from "@/lib/design-tokens";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

type Target =
  | { kind: "community_admin"; id: number; name: string }
  | { kind: "community"; id: number; name: string };

export function ContextualActivityModal({
  target,
  onClose,
}: {
  target: Target | null;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const res =
        target.kind === "community_admin"
          ? await fetchCommunityAdminActivityLogs(target.id, { search, page, perPage: ADMIN_TABLE_PAGE_SIZE })
          : await fetchCommunityActivityLogs(target.id, { search, page, perPage: ADMIN_TABLE_PAGE_SIZE });
      setLogs(res.data);
      setTotal(res.total);
      setLastPage(res.last_page);
    } catch (err) {
      setLogs([]);
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [target, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setSearch("");
  }, [target?.id, target?.kind]);

  if (!target || typeof document === "undefined") return null;

  const title = target.kind === "community_admin" ? "Community Admin activity" : "Community activity";
  const subtitle =
    target.kind === "community_admin"
      ? `Actions performed by ${target.name}`
      : `All auditable activity for ${target.name}`;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">{title}</p>
            <h3 className="text-[15px] font-bold text-slate-900">{target.name}</h3>
            <p className="mt-0.5 text-[12.5px] text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="shrink-0 border-b border-slate-100 px-6 py-3">
          <div className="nl-search-field">
            <span className="nl-search-icon">
              <Search className="h-3.5 w-3.5" />
            </span>
            <ClearableInput
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search this activity history…"
              className="nl-input h-10 rounded-xl text-[13px]"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          {loading ? <p className="text-sm text-slate-500">Loading activity…</p> : null}
          {!loading && !error && logs.length === 0 ? (
            <p className="text-sm text-slate-500">No activity recorded yet.</p>
          ) : null}
          {logs.map((log) => (
            <ActivityLogRow key={log.id} log={log} />
          ))}
        </div>
        <div className="shrink-0 border-t border-slate-100 px-6 py-3" style={{ borderColor: NL.borderCard }}>
          <DtPagination
            showing={logs.length}
            total={total}
            page={page}
            lastPage={lastPage}
            onPageChange={setPage}
            pageSize={ADMIN_TABLE_PAGE_SIZE}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
