import { useState } from "react";
import type { ActivityLog, ActivitySeverity } from "@/lib/api/activity-logs";
import { formatLogTime, relLogTime } from "@/lib/api/activity-logs";
import { NL } from "@/lib/design-tokens";
import { AdminBadge } from "@/components/admin/ui";
import { ActivityAuditDetails } from "@/components/admin/activity/activity-audit-details";

export const SEV_CONFIG: Record<
  ActivitySeverity,
  { label: string; color: string; bg: string; dot: string; border: string }
> = {
  info: {
    label: "Info",
    color: NL.brandPrimaryDeep,
    bg: NL.chipBg,
    dot: NL.brandPrimary,
    border: "rgba(27, 79, 138, 0.8)",
  },
  warning: {
    label: "Warning",
    color: NL.warning,
    bg: "#FFFBEB",
    dot: "#F59E0B",
    border: "rgba(254, 154, 0, 0.35)",
  },
  error: {
    label: "Error",
    color: NL.danger,
    bg: "#FEF2F2",
    dot: "#EF4444",
    border: "rgba(231, 0, 11, 0.25)",
  },
  critical: {
    label: "Critical",
    color: "#7C3AED",
    bg: "#F5F3FF",
    dot: "#8B5CF6",
    border: "rgba(124, 58, 237, 0.35)",
  },
};

const ACTION_ICON_KEY: Record<string, string> = {
  login: "lock",
  logout: "logout",
  member_approved: "check",
  member_suspended: "ban",
  notice_published: "megaphone",
  notice_created: "doc",
  report_resolved: "shield",
  report_escalated: "warning",
  listing_approved: "tag",
  listing_rejected: "x",
  profile_updated: "user",
  cron_executed: "gear",
  db_backup: "db",
  email_sent: "mail",
  push_sent: "bell",
  api_error: "alert",
  failed_login: "lock",
  cache_cleared: "refresh",
  storage_alert: "disk",
  deployment: "rocket",
  rate_limit: "stop",
};

function roleTone(role: string | null): "blue" | "violet" | "green" | "slate" {
  if (role === "admin" || role === "system_admin") return "blue";
  if (role === "moderator") return "violet";
  if (role === "resident") return "green";
  return "slate";
}

export function ActivityLogRow({ log }: { log: ActivityLog }) {
  const sev = SEV_CONFIG[log.severity] ?? SEV_CONFIG.info;
  const iconKey = ACTION_ICON_KEY[log.action] ?? "doc";
  const [open, setOpen] = useState(false);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setOpen((current) => !current);
        }
      }}
      className="group cursor-pointer rounded-2xl border bg-white p-4 text-left transition hover:shadow-md"
      style={{ borderColor: sev.border, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&_svg]:h-4 [&_svg]:w-4"
          style={{ background: sev.bg, color: sev.color }}
        >
          <ActionIcon name={iconKey} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-bold capitalize" style={{ color: NL.textPrimary }}>
              {log.action.replace(/_/g, " ")}
            </h3>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ background: sev.bg, color: sev.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: sev.dot }} />
              {sev.label}
            </span>
            {log.entity_type ? (
              <span
                className="rounded-md border px-2 py-0.5 text-[11px] font-medium"
                style={{ borderColor: NL.borderCard, color: NL.textSecondary, background: NL.surfaceMuted }}
              >
                {log.entity_type}
                {log.entity_id ? ` #${log.entity_id}` : ""}
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: NL.textSecondary }}>
            {log.description}
          </p>

          <ActivityAuditDetails
            performedBy={log.performed_by}
            affectedUser={log.affected_user}
            entityType={log.entity_type}
            entityId={log.entity_id}
            changes={log.changes}
            communityName={log.community_name}
            module={log.module}
            status={log.status}
            requestId={log.request_id}
            ipAddress={log.ip_address}
            userAgent={log.user_agent}
            error={log.error}
            expanded={open}
          />

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]" style={{ color: NL.textMuted }}>
            {log.user_name ? (
              <span className="inline-flex items-center gap-2">
                <span className="font-semibold" style={{ color: NL.textBody }}>
                  {log.user_name}
                </span>
                {log.user_role ? <AdminBadge tone={roleTone(log.user_role)}>{log.user_role}</AdminBadge> : null}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium"
                style={{ background: NL.surfaceMuted, color: NL.textSecondary }}
              >
                <IcoServer /> System
              </span>
            )}
            {log.ip_address ? <span className="font-mono">{log.ip_address}</span> : null}
            <span title={formatLogTime(log.created_at)}>
              {relLogTime(log.created_at)} · {formatLogTime(log.created_at)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function ActionIcon({ name }: { name: string }) {
  switch (name) {
    case "lock":
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M8 2l5 2v4c0 3.314-2.239 5.5-5 6.5-2.761-1-5-3.186-5-6.5V4l5-2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "megaphone":
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M12 2l-7 4H2a1 1 0 00-1 1v2a1 1 0 001 1h3l7 4V2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case "gear":
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
  }
}

function IcoServer() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="3" width="13" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="9" width="13" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
