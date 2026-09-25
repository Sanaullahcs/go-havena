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

export type ActivityLogTab = "all" | "residents" | "community_admins" | "guests" | "system";

export type ActivityLog = {
  id: number;
  log_type: ActivityLogType;
  action: string;
  description: string;
  entity_type: string | null;
  entity_id: number | null;
  ip_address: string | null;
  user_agent?: string | null;
  severity: ActivitySeverity;
  created_at: string;
  user_name: string | null;
  user_role: string | null;
  changes?: ActivityLogChange[];
  performed_by?: string | null;
  affected_user?: string | null;
  affected_user_id?: number | null;
  actor_role_label?: string | null;
  actor_user_id?: number | null;
  actor_type?: string | null;
  subject_user_id?: number | null;
  community_id?: number | null;
  community_name?: string | null;
  module?: string | null;
  status?: string | null;
  request_id?: string | null;
  error?: string | null;
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

export type PaginatedLogs = {
  data: ActivityLog[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export async function fetchActivityLogs(params: {
  type?: ActivityLogType;
  tab?: ActivityLogTab;
  severity?: ActivitySeverity | "all";
  search?: string;
  page?: number;
  perPage?: number;
  communityId?: number;
  actorUserId?: number;
  role?: string;
  module?: string;
  action?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  ip?: string;
}): Promise<PaginatedLogs> {
  const query: Record<string, string | number> = {
    page: params.page ?? 1,
    per_page: params.perPage ?? ADMIN_TABLE_PAGE_SIZE,
  };

  if (params.type) query.type = params.type;
  if (params.tab && params.tab !== "all") query.tab = params.tab;
  if (params.severity && params.severity !== "all") query.severity = params.severity;
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.communityId) query.community_id = params.communityId;
  if (params.actorUserId) query.actor_user_id = params.actorUserId;
  if (params.role) query.role = params.role;
  if (params.module) query.module = params.module;
  if (params.action) query.action = params.action;
  if (params.status) query.status = params.status;
  if (params.dateFrom) query.date_from = params.dateFrom;
  if (params.dateTo) query.date_to = params.dateTo;
  if (params.ip) query.ip = params.ip;

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

const UNSET_ACTIVITY_LABELS = new Set(["", "(empty)", "null", "undefined"]);

/** Friendly label for a missing previous/next audit value. Does not change stored data. */
export function formatActivityChangeValue(value: string | number | null | undefined): string {
  if (value == null) return "Not set";
  const trimmed = String(value).trim();
  if (UNSET_ACTIVITY_LABELS.has(trimmed.toLowerCase())) return "Not set";
  return String(value);
}

/** Replace stored "(empty)" tokens in activity descriptions for display only. */
export function formatActivityDescription(description: string | null | undefined): string {
  if (!description) return "";
  return description.replace(/\(empty\)/gi, "Not set");
}

/**
 * Parse an activity timestamp once.
 * Timezone-aware values keep their offset. Naive UTC datetimes from older responses
 * are read as UTC so the browser does not treat them as local time.
 */
export function parseActivityTimestamp(ts: string | null | undefined): Date | null {
  const trimmed = ts?.trim();
  if (!trimmed) return null;

  const hasZone = /(?:[zZ]|[+-]\d{2}:\d{2}|[+-]\d{4})$/.test(trimmed);
  const normalized = hasZone
    ? trimmed
    : trimmed.replace(
        /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/,
        "$1T$2Z",
      );

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLogTime(ts: string) {
  try {
    const date = parseActivityTimestamp(ts);
    if (!date) return ts;
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

export async function fetchCommunityAdminActivityLogs(
  adminId: number,
  params: { search?: string; dateFrom?: string; dateTo?: string; page?: number; perPage?: number } = {},
): Promise<PaginatedLogs> {
  const res = await api.get(`/v1/admin/community-admins/${adminId}/activity-logs`, {
    params: {
      search: params.search,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      page: params.page ?? 1,
      per_page: params.perPage ?? ADMIN_TABLE_PAGE_SIZE,
    },
  });
  const body = res.data ?? {};
  return {
    data: body.data ?? [],
    current_page: body.current_page ?? 1,
    last_page: body.last_page ?? 1,
    per_page: body.per_page ?? ADMIN_TABLE_PAGE_SIZE,
    total: body.total ?? 0,
  };
}

export async function fetchCommunityActivityLogs(
  communityId: number,
  params: { search?: string; dateFrom?: string; dateTo?: string; page?: number; perPage?: number } = {},
): Promise<PaginatedLogs> {
  const res = await api.get(`/v1/admin/communities/${communityId}/activity-logs`, {
    params: {
      search: params.search,
      date_from: params.dateFrom,
      date_to: params.dateTo,
      page: params.page ?? 1,
      per_page: params.perPage ?? ADMIN_TABLE_PAGE_SIZE,
    },
  });
  const body = res.data ?? {};
  return {
    data: body.data ?? [],
    current_page: body.current_page ?? 1,
    last_page: body.last_page ?? 1,
    per_page: body.per_page ?? ADMIN_TABLE_PAGE_SIZE,
    total: body.total ?? 0,
  };
}

export function relLogTime(ts: string, now = Date.now()) {
  const date = parseActivityTimestamp(ts);
  if (!date) return ts;
  const diff = now - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) {
    const mins = Math.floor(diff / 60_000);
    return mins === 1 ? "1 min ago" : `${mins} mins ago`;
  }
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    return hours === 1 ? "1h ago" : `${hours}h ago`;
  }
  const days = Math.floor(diff / 86_400_000);
  return days === 1 ? "1d ago" : `${days}d ago`;
}
