"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Search,
  Activity,
  X,
} from "lucide-react";
import { UserAvatar } from "@/components/admin/user-avatar";
import { ThemedDatePicker } from "@/components/ui/themed-date-picker";
import {
  fetchMemberActivityLogs,
  type MemberActivityLog,
  type MemberActivityMeta,
} from "@/lib/api/members";
import { formatLogTime, relLogTime } from "@/lib/api/activity-logs";
import { ActivityAuditDetails } from "@/components/admin/activity/activity-audit-details";
import { apiError } from "@/lib/api/client";
import { NL } from "@/lib/design-tokens";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Member } from "@/lib/api/members";

type Props = {
  member: Member | null;
  communityId?: number;
  onClose: () => void;
};

type DatePreset = "all" | "today" | "yesterday" | "week" | "custom";

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftDays(days: number) {
  const next = new Date();
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
}

function statusStyle(status: string) {
  const key = status.toLowerCase();
  if (key === "approved" || key === "active" || key === "published") {
    return { bg: "#ECFDF5", color: "#059669", border: "rgba(16, 185, 129, 0.25)" };
  }
  if (key === "pending" || key === "draft" || key === "onboarding" || key === "invitation_sent") {
    return { bg: "#FFFBEB", color: "#D97706", border: "rgba(217, 119, 6, 0.25)" };
  }
  if (key === "rejected" || key === "deleted" || key === "banned") {
    return { bg: "#FEF2F2", color: "#DC2626", border: "rgba(220, 38, 38, 0.25)" };
  }
  if (key === "sold") {
    return { bg: "#E8F0F7", color: "#1B4F8A", border: "rgba(27, 79, 138, 0.25)" };
  }
  return { bg: NL.chipBg, color: NL.brandPrimaryDeep, border: NL.borderCard };
}

const ACTION_VISUAL: Record<string, { bg: string; color: string; icon: string }> = {
  login: { bg: "#E8F0F7", color: "#1B4F8A", icon: "login" },
  logout: { bg: "#F8FAFC", color: "#64748B", icon: "login" },
  post_created: { bg: "#ECFDF5", color: "#059669", icon: "post" },
  post_deleted: { bg: "#FEF2F2", color: "#DC2626", icon: "post" },
  post_liked: { bg: "#FFF1F2", color: "#E11D48", icon: "heart" },
  post_commented: { bg: "#F5F3FF", color: "#7C3AED", icon: "comment" },
  listing_created: { bg: "#E8F0F7", color: "#EA580C", icon: "tag" },
  listing_updated: { bg: "#E8F0F7", color: "#EA580C", icon: "tag" },
  listing_approved: { bg: "#ECFDF5", color: "#059669", icon: "check" },
  listing_rejected: { bg: "#FEF2F2", color: "#DC2626", icon: "x" },
  listing_sold: { bg: "#E8F0F7", color: "#1B4F8A", icon: "tag" },
  business_created: { bg: "#ECFEFF", color: "#0891B2", icon: "store" },
  deal_created: { bg: "#FEF3C7", color: "#B45309", icon: "deal" },
  notice_created: { bg: "#E8F0F7", color: "#1B4F8A", icon: "megaphone" },
  event_created: { bg: "#F5F3FF", color: "#7C3AED", icon: "calendar" },
  alert_created: { bg: "#FEF2F2", color: "#DC2626", icon: "alert" },
  profile_updated: { bg: "#F8FAFC", color: "#475569", icon: "user" },
};

function actionVisual(action: string) {
  return ACTION_VISUAL[action] ?? { bg: NL.chipBg, color: NL.brandPrimaryDeep, icon: "doc" };
}

function dayGroupLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function groupLogsByDay(logs: MemberActivityLog[]) {
  const groups: { label: string; items: MemberActivityLog[] }[] = [];
  for (const log of logs) {
    const label = dayGroupLabel(log.created_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) {
      last.items.push(log);
    } else {
      groups.push({ label, items: [log] });
    }
  }
  return groups;
}

function ActivityIcon({ name }: { name: string }) {
  switch (name) {
    case "login":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "post":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 3h10v8H6l-3 2V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "heart":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 13s-4.5-2.8-5.8-5.2C1.1 5.8 2.4 3.5 4.8 3.5c1.2 0 2.2.6 2.8 1.5.6-.9 1.6-1.5 2.8-1.5 2.4 0 3.7 2.3 2.6 4.3C12.5 10.2 8 13 8 13z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "comment":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 3h10v7H6l-3 2V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M5.5 6.5h5M5.5 8.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "tag":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 8.5V3.5h5l6.5 6.5-3.5 3.5L2 8.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "store":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 6.5L3 3h10l1 3.5v7H2v-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M6 13.5V9h4v4.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "deal":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3 5.5l5-2.5 5 2.5v5l-5 2.5-5-2.5v-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "megaphone":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M12 2l-7 4H2a1 1 0 00-1 1v2a1 1 0 001 1h3l7 4V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 2v2.5M11 2v2.5M2.5 7h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "alert":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 2.5l6 10H2L8 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M8 6.5v3M8 11h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "user":
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M3.5 13.5c.8-2.2 2.4-3.5 4.5-3.5s3.7 1.3 4.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
  }
}

function ActivityRow({ log }: { log: MemberActivityLog }) {
  const visual = actionVisual(log.action);
  const badge = log.status ? statusStyle(log.status) : null;

  return (
    <div className="nl-resident-activity-item">
      <span className="nl-resident-activity-icon" style={{ background: visual.bg, color: visual.color }}>
        <ActivityIcon name={visual.icon} />
      </span>
      <article className="nl-resident-activity-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-bold leading-snug" style={{ color: NL.textPrimary }}>
              {log.activity_name}
            </h4>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: NL.textSecondary }}>
              {log.description}
            </p>
            <ActivityAuditDetails
              performedBy={log.performed_by}
              affectedUser={log.affected_user}
              entityType={log.entity_type}
              entityId={log.entity_id}
              changes={log.changes}
            />
          </div>
          {badge && log.status ? (
            <span
              className="shrink-0 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold capitalize"
              style={{ background: badge.bg, color: badge.color, borderColor: badge.border }}
            >
              {log.status}
            </span>
          ) : null}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: NL.textMuted }}>
          <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium" style={{ background: NL.surfaceMuted }}>
            <Clock3 className="h-3 w-3" strokeWidth={2} />
            <span title={formatLogTime(log.created_at)}>
              {relLogTime(log.created_at)} · {formatLogTime(log.created_at)}
            </span>
          </span>
          {log.related_item ? (
            <span
              className="rounded-md border px-2 py-0.5 font-medium"
              style={{ borderColor: NL.borderCard, color: NL.textSecondary, background: "#FAFBFC" }}
            >
              {log.related_item}
            </span>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function CompactPager({
  page,
  lastPage,
  onPageChange,
}: {
  page: number;
  lastPage: number;
  onPageChange: (page: number) => void;
}) {
  if (lastPage <= 1) return null;

  return (
    <nav className="nl-resident-activity-pager" aria-label="Activity pagination">
      <button
        type="button"
        className="nl-resident-activity-pager-btn"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      <span className="nl-resident-activity-pager-btn is-active" aria-current="page">
        {page}
      </span>
      <button
        type="button"
        className="nl-resident-activity-pager-btn"
        aria-label="Next page"
        disabled={page >= lastPage}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
    </nav>
  );
}

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Last 7 days" },
];

export function ResidentActivityModal({ member, communityId, onClose }: Props) {
  const [logs, setLogs] = useState<MemberActivityLog[]>([]);
  const [meta, setMeta] = useState<MemberActivityMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customDate, setCustomDate] = useState("");
  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [dismissReady, setDismissReady] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const dateParams = useMemo(() => {
    if (datePreset === "today") return { date: shiftDays(0) };
    if (datePreset === "yesterday") return { date: shiftDays(-1) };
    if (datePreset === "week") return { dateFrom: shiftDays(-6), dateTo: shiftDays(0) };
    if (datePreset === "custom" && customDate) return { date: customDate };
    return {};
  }, [datePreset, customDate]);

  const memberId = member?.id ?? null;
  const memberCommunityId = communityId ?? member?.community_id ?? undefined;
  const hasLoadedLogs = useRef(false);

  const load = useCallback(async () => {
    if (!memberId) return;

    if (!hasLoadedLogs.current) setLoading(true);
    setError(null);

    try {
      const res = await fetchMemberActivityLogs(memberId, {
        communityId: memberCommunityId,
        search: debouncedSearch || undefined,
        ...dateParams,
        page,
        perPage: ADMIN_TABLE_PAGE_SIZE,
      });
      setLogs(res.data);
      setMeta(res.meta);
      hasLoadedLogs.current = true;
    } catch (err) {
      setLogs([]);
      setMeta(null);
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [memberId, memberCommunityId, debouncedSearch, dateParams, page]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!member) {
      setDismissReady(false);
      return;
    }

    hasLoadedLogs.current = false;
    setPage(1);
    setSearch("");
    setDatePreset("all");
    setCustomDate("");

    const frame = window.requestAnimationFrame(() => {
      setDismissReady(true);
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [member?.id]);

  useEffect(() => {
    if (!memberId) return;
    setPage(1);
  }, [memberId, debouncedSearch, datePreset, customDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!member) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.querySelector(".nl-themed-popover")) return;
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [member, onClose]);

  const groupedLogs = useMemo(() => groupLogsByDay(logs), [logs]);

  if (!member || !mounted) return null;

  const hasFilters = Boolean(debouncedSearch || datePreset !== "all" || customDate);
  const rangeStart = meta && meta.total > 0 ? (meta.current_page - 1) * ADMIN_TABLE_PAGE_SIZE + 1 : 0;
  const rangeEnd = meta ? rangeStart + logs.length - 1 : 0;

  const selectPreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== "custom") setCustomDate("");
  };

  const handleCustomDate = (value: string) => {
    setCustomDate(value);
    setDatePreset(value ? "custom" : "all");
  };

  return createPortal(
    <div
      className="nl-resident-activity-backdrop"
      role="presentation"
      onClick={(event) => {
        if (!dismissReady) return;
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="nl-resident-activity-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resident-activity-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="nl-resident-activity-head">
          <div className="flex min-w-0 items-start gap-3">
            <UserAvatar name={member.name} src={member.avatar_url} size={46} />
            <div className="min-w-0">
              <p className="nl-resident-activity-eyebrow">Resident activity</p>
              <h3 id="resident-activity-title" className="nl-resident-activity-title truncate">
                {member.name}
              </h3>
              <p className="nl-resident-activity-sub">
                {member.unit_number ? `Unit ${member.unit_number}` : "Community member"}
                {member.community_name ? ` · ${member.community_name}` : ""}
              </p>
              {meta && meta.total > 0 ? (
                <span className="nl-resident-activity-count">
                  <Activity className="h-3 w-3" strokeWidth={2.25} />
                  {meta.total} {meta.total === 1 ? "record" : "records"}
                </span>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="nl-notice-modal-close" aria-label="Close">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="nl-resident-activity-filters">
          <div className="nl-resident-activity-filter-row">
            <div className="nl-resident-activity-search">
              <Search className="h-4 w-4" strokeWidth={2} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search activity…"
                aria-label="Search activity"
              />
            </div>
            <ThemedDatePicker
              value={customDate}
              onChange={handleCustomDate}
              placeholder="Pick date"
              compact
              icon={<Calendar className="h-3.5 w-3.5" strokeWidth={2} />}
            />
          </div>

          <div className="nl-resident-activity-chips">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={[
                  "nl-resident-activity-chip",
                  datePreset === preset.id && !customDate ? "is-active" : "",
                ].join(" ")}
                onClick={() => selectPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
            {customDate ? (
              <button
                type="button"
                className="nl-resident-activity-chip is-active"
                onClick={() => handleCustomDate("")}
              >
                {new Date(`${customDate}T12:00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                ×
              </button>
            ) : null}
            {hasFilters ? (
              <button
                type="button"
                className="nl-resident-activity-chip"
                onClick={() => {
                  setSearch("");
                  setDatePreset("all");
                  setCustomDate("");
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>

        <div className="nl-resident-activity-body">
          {loading ? (
            <div className="py-14 text-center">
              <div
                className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: NL.brandPrimary, borderTopColor: "transparent" }}
              />
              <p className="text-[13px]" style={{ color: NL.textMuted }}>
                Loading activity…
              </p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-10 text-center">
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          ) : logs.length === 0 ? (
            <div
              className="rounded-2xl border px-4 py-14 text-center"
              style={{ borderColor: NL.borderCard, background: NL.surfaceMuted }}
            >
              <p className="text-[13px] font-semibold" style={{ color: NL.textSecondary }}>
                {member.status === "invitation_sent" && !hasFilters
                  ? "No activity available yet. This invitation has not been accepted."
                  : member.status === "onboarding" && !hasFilters
                    ? "No activity available yet. This member is still completing onboarding."
                    : "No activity found"}
              </p>
              {(member.status === "invitation_sent" || member.status === "onboarding") && !hasFilters ? null : (
                <p className="mt-1 text-[12px]" style={{ color: NL.textMuted }}>
                  {hasFilters
                    ? "Try a different search term or date range."
                    : "This resident has no recorded activity yet."}
                </p>
              )}
            </div>
          ) : (
            groupedLogs.map((group) => (
              <section key={group.label} className="nl-resident-activity-day">
                <p className="nl-resident-activity-day-label">{group.label}</p>
                {group.items.map((log) => (
                  <ActivityRow key={log.id} log={log} />
                ))}
              </section>
            ))
          )}
        </div>

        {!loading && !error && meta && meta.total > 0 ? (
          <footer className="nl-resident-activity-foot">
            <p className="nl-resident-activity-foot-meta">
              Showing <strong>{rangeStart}–{rangeEnd}</strong> of <strong>{meta.total}</strong>
            </p>
            <CompactPager page={meta.current_page} lastPage={meta.last_page} onPageChange={setPage} />
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
