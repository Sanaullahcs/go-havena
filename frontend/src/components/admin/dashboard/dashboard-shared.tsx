import type { ReactNode } from "react";
import Link from "next/link";
import { AdminBadge } from "@/components/admin/ui";
import type { AdminDashboardPendingAction } from "@/lib/api/dashboard";
import { NL } from "@/lib/design-tokens";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
} from "@/components/admin/dashboard/dashboard-icons";

import { ADMIN_TONE, type AdminTone } from "@/lib/admin/admin-tones";

export type DashboardTone = AdminTone;

export function formatDashboardGeneratedAt(value?: string) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return null;
  }
}

const TONE_ICON_BG: Record<DashboardTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-[#D1FAF5] text-[#0D9488]",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
  violet: "bg-violet-50 text-violet-600",
  cyan: "bg-cyan-50 text-cyan-700",
  emerald: "bg-[#D1FAF5] text-[#0D9488]",
  teal: "bg-[#D1FAF5] text-[#0D9488]",
};

export function DashboardHero({
  eyebrow,
  title,
  description,
  variant = "system",
  badges,
  composeActions,
  generatedAt,
  refreshing,
  onRefresh,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  variant?: "system" | "community";
  badges?: ReactNode;
  composeActions?: ReactNode;
  generatedAt?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  compact?: boolean;
}) {
  const gradient =
    variant === "community"
      ? "nl-dashboard-hero nl-dashboard-hero--community"
      : "nl-dashboard-hero nl-dashboard-hero--system";

  if (compact) {
    return (
      <section className={`${gradient} nl-dashboard-hero--compact`}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="nl-dashboard-eyebrow mb-0">{eyebrow}</p>
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
            </div>
            {generatedAt ? (
              <p className="mt-0.5 text-[11px] text-slate-400">Updated {generatedAt}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {composeActions}
            {badges}
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="nl-btn-secondary inline-flex h-8 items-center gap-1 px-2.5 text-[12px]"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                  strokeWidth={2}
                  aria-hidden
                />
                {refreshing ? "…" : "Refresh"}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={gradient}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="nl-dashboard-eyebrow">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem]">
            {title}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {badges}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="nl-btn-secondary inline-flex items-center gap-1.5"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={2}
                aria-hidden
              />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </div>
      </div>

      {composeActions || generatedAt ? (
        <div className="nl-dashboard-hero-foot">
          {generatedAt ? (
            <p className="text-[12px] text-slate-500">Last updated {generatedAt}</p>
          ) : (
            <span aria-hidden />
          )}
          {composeActions}
        </div>
      ) : null}
    </section>
  );
}

export function PendingAlertBanner({
  children,
  href,
  actionLabel = "Review now",
}: {
  children: ReactNode;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="nl-pending-banner">
      <span className="nl-pending-banner-icon flex items-center justify-center" aria-hidden>
        <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-amber-950/90">{children}</div>
      {href ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-amber-800 transition hover:text-amber-950"
        >
          {actionLabel}
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </Link>
      ) : null}
    </div>
  );
}

export function DashboardEmptyState({
  title,
  description,
  icon,
  compact = false,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "nl-dashboard-empty nl-dashboard-empty--compact" : "nl-dashboard-empty"}>
      <div className={compact ? "nl-dashboard-empty-icon nl-dashboard-empty-icon--compact" : "nl-dashboard-empty-icon"}>
        {icon ?? <CheckCircle2 className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2} />}
      </div>
      <p className={`font-semibold text-slate-700 ${compact ? "text-[13px]" : "text-[14px]"}`}>{title}</p>
      <p className={`max-w-sm text-slate-500 ${compact ? "mt-0.5 text-[11.5px] leading-snug" : "mt-1 text-[13px]"}`}>
        {description}
      </p>
    </div>
  );
}

export function actionTypeLabel(type: AdminDashboardPendingAction["type"]) {
  switch (type) {
    case "membership":
      return "Resident approval";
    case "family_add_member":
      return "Family member";
    case "community_admin":
      return "Community admin";
    case "post":
      return "Post";
    case "listing":
      return "Listing";
    case "notice":
      return "Notice";
    case "event":
      return "Event";
    case "alert":
      return "Alert";
    case "community_request":
      return "Community";
    case "business":
      return "Business";
    case "booking":
      return "Booking";
    case "amenity_review":
      return "Amenity";
    case "amenity_payment":
      return "Amenity bill";
    case "service_payment":
      return "Service bill";
    case "unit_registration":
      return "Unit request";
    case "landlord_ownership":
      return "Landlord claim";
    default:
      return "Item";
  }
}

export function actionTypeStyle(type: AdminDashboardPendingAction["type"]) {
  switch (type) {
    case "membership":
    case "family_add_member":
      return "bg-amber-50 text-amber-800 ring-amber-100";
    case "post":
      return "bg-blue-50 text-blue-800 ring-blue-100";
    case "listing":
      return "bg-[#D1FAF5] text-[#0D9488] ring-[#D1FAF5]";
    case "notice":
    case "event":
    case "alert":
      return "bg-violet-50 text-violet-800 ring-violet-100";
    case "business":
    case "amenity_payment":
    case "service_payment":
      return "bg-amber-50 text-amber-800 ring-amber-100";
    case "booking":
    case "amenity_review":
      return "bg-cyan-50 text-cyan-800 ring-cyan-100";
    case "unit_registration":
      return "bg-teal-50 text-teal-800 ring-teal-100";
    case "landlord_ownership":
      return "bg-blue-50 text-blue-800 ring-blue-100";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function pendingDocumentLabel(kind: string) {
  if (kind === "utility_bill") return "Utility bill";
  if (kind === "ownership_proof") return "Ownership proof";
  if (kind === "tenancy_proof") return "Tenancy proof";
  return "Document";
}

function pendingResidenceLabel(type?: string | null) {
  if (type === "homeowner") return "Homeowner";
  if (type === "tenant") return "Tenant";
  return null;
}

export function PendingActionUnits({ action }: { action: AdminDashboardPendingAction }) {
  const units = action.units ?? [];
  if (units.length === 0) {
    if (!action.utility_bill_url) return null;
    return (
      <a
        href={action.utility_bill_url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex text-[11px] font-semibold text-[#1B4F8A] underline"
      >
        Utility bill
      </a>
    );
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {units.map((unit, index) => {
        const residence = pendingResidenceLabel(unit.residence_type);
        return (
          <div
            key={`${unit.unit_number}-${index}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600"
          >
            <span className="font-semibold text-slate-700">
              Unit {unit.unit_number}
              {residence ? ` · ${residence}` : ""}
            </span>
            {(unit.documents ?? []).map((document) => (
              <a
                key={`${document.kind}-${document.file_url}`}
                href={document.file_url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#1B4F8A] underline"
              >
                {pendingDocumentLabel(document.kind)}
              </a>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function PendingQueueItem({
  action,
  relTime,
  children,
}: {
  action: AdminDashboardPendingAction;
  relTime: string;
  children?: ReactNode;
}) {
  return (
    <div className="nl-pending-row">
      <span className={`nl-pending-type ${actionTypeStyle(action.type)}`}>
        {actionTypeLabel(action.type)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900">{action.title}</p>
        <p className="text-[12px] text-slate-600">{action.subtitle}</p>
        {action.detail ? (
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{action.detail}</p>
        ) : null}
        <PendingActionUnits action={action} />
      </div>
      <span className="hidden shrink-0 text-[11px] font-medium text-slate-400 sm:block">{relTime}</span>
      {children}
    </div>
  );
}

export function ManageLinkCard({
  label,
  description,
  href,
  badge,
  tone = "blue",
  icon,
}: {
  label: string;
  description?: string;
  href: string;
  badge?: string;
  tone?: DashboardTone;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-200/70 hover:bg-blue-50/40 hover:shadow-sm"
    >
      {icon ? (
        <span
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            TONE_ICON_BG[tone] ?? TONE_ICON_BG.green,
          ].join(" ")}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-800 group-hover:text-slate-900">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{description}</p>
        ) : null}
      </div>
      {badge ? (
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm"
          style={{ background: (ADMIN_TONE[tone] ?? ADMIN_TONE.green).accent }}
        >
          {badge}
        </span>
      ) : (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
          strokeWidth={2}
          aria-hidden
        />
      )}
    </Link>
  );
}

export function QuickActionTile({
  icon,
  title,
  description,
  onClick,
  tone = "blue",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  tone?: DashboardTone;
}) {
  return (
    <button type="button" onClick={onClick} className={`nl-quick-action-v2 nl-quick-action-v2--${tone}`}>
      <span className="nl-quick-action-v2-icon">{icon}</span>
      <span className="font-semibold text-slate-900">{title}</span>
      <span className="text-[12px] leading-snug text-slate-500">{description}</span>
    </button>
  );
}

export function ActivityLogItem({
  userName,
  description,
  action,
  severity,
  relTime,
}: {
  userName: string;
  description: string;
  action: string;
  severity: string;
  relTime: string;
}) {
  const severityTone: Record<string, string> = {
    info: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-rose-50 text-rose-700",
    critical: "bg-red-100 text-red-800",
  };

  return (
    <div className="nl-activity-row">
      <span
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold uppercase",
          severityTone[severity] ?? severityTone.info,
        ].join(" ")}
      >
        {(severity ?? "info").slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-slate-700">
          <span className="font-semibold text-slate-900">{userName}</span>
          {" · "}
          {description}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span>{relTime}</span>
          <span aria-hidden>·</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {action.replace(/_/g, " ")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LiveBadge({ label = "Live" }: { label?: string }) {
  return (
    <AdminBadge tone="green">
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#14B8A6]" aria-hidden />
      {label}
    </AdminBadge>
  );
}
