import api from "@/lib/api/client";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

export type ActivityLogType = "user" | "system";
export type ActivitySeverity = "info" | "warning" | "error" | "critical";

export type ActivityLogChange = {
  field: string;
  key?: string | null;
  previous: string;
  next: string;
};

export type ActivityLog = {
  id: number;
  log_type: ActivityLogType;
  action: string;
  description: string;
  entity_type: string | null;
  entity_id: number | null;
  ip_address: string | null;
  severity: ActivitySeverity;
  created_at: string;
  user_name: string | null;
  user_role: string | null;
  changes?: ActivityLogChange[];
  performed_by?: string | null;
  affected_user?: string | null;
  affected_user_id?: number | null;
  actor_role_label?: string | null;
  module?: string | null;
};

export type ActivityLogStats = {
  today_total: number;
  today_errors: number;
  user_total: number;
  system_total: number;
  warnings: number;
  errors: number;
  critical: number;
  last_log: ActivityLog | null;
};

type PaginatedLogs = {
  data: ActivityLog[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export async function fetchActivityLogs(params: {
  type?: ActivityLogType;
  severity?: ActivitySeverity | "all";
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedLogs> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    per_page: params.perPage ?? ADMIN_TABLE_PAGE_SIZE,
  };

  if (params.type) query.type = params.type;
  if (params.severity && params.severity !== "all") query.severity = params.severity;
  if (params.search?.trim()) query.search = params.search.trim();

  const res = await api.get("/v1/activity-logs", { params: query });
  const body = res.data ?? {};

  return {
    data: body.data ?? [],
    current_page: body.current_page ?? 1,
    last_page: body.last_page ?? 1,
    per_page: body.per_page ?? ADMIN_TABLE_PAGE_SIZE,
    total: body.total ?? 0,
  };
}

export async function fetchActivityLogStats(): Promise<ActivityLogStats> {
  const [statsRes, latestRes] = await Promise.all([
    api.get("/v1/activity-logs/stats").catch(() => ({ data: null })),
    api.get("/v1/activity-logs", { params: { per_page: 1, page: 1 } }).catch(() => ({ data: { data: [] } })),
  ]);

  const stats = statsRes.data ?? {};
  const counts: { log_type: string; severity: string; count: number }[] = stats.counts ?? [];

  const sum = (type?: ActivityLogType, severity?: ActivitySeverity) =>
    counts
      .filter((row) => (!type || row.log_type === type) && (!severity || row.severity === severity))
      .reduce((acc, row) => acc + row.count, 0);

  const latest: ActivityLog[] = latestRes.data?.data ?? [];

  return {
    today_total: stats.today_total ?? 0,
    today_errors: stats.today_errors ?? 0,
    user_total: sum("user"),
    system_total: sum("system"),
    warnings: sum(undefined, "warning"),
    errors: sum(undefined, "error"),
    critical: sum(undefined, "critical"),
    last_log: latest[0] ?? null,
  };
}

export function formatLogTime(ts: string) {
  try {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function relLogTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(diff)) return ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
