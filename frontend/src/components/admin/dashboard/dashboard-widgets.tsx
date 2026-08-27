import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ChevronRight,
  FileText,
  UserPlus,
  Users,
} from "lucide-react";
import type { AdminDashboardPendingAction } from "@/lib/api/dashboard";
import type { DashboardTone } from "@/components/admin/dashboard/dashboard-shared";
import { actionTypeLabel } from "@/components/admin/dashboard/dashboard-shared";
import { formatPhonesInText } from "@/lib/phone/format";
import { DASHBOARD_TONE, toneIcon } from "@/components/admin/dashboard/dashboard-theme";
import { NL } from "@/lib/design-tokens";

const PENDING_META: Record<
  AdminDashboardPendingAction["type"],
  { tone: DashboardTone; icon: LucideIcon }
> = {
  membership: { tone: "amber", icon: UserPlus },
  family_add_member: { tone: "amber", icon: UserPlus },
  community_admin: { tone: "violet", icon: UserPlus },
  post: { tone: "blue", icon: FileText },
  listing: { tone: "green", icon: FileText },
  notice: { tone: "violet", icon: FileText },
  event: { tone: "cyan", icon: FileText },
  alert: { tone: "red", icon: FileText },
  community_request: { tone: "violet", icon: Building2 },
};

export function DashboardPendingCard({
  action,
  relTime,
  children,
}: {
  action: AdminDashboardPendingAction;
  relTime: string;
  children?: React.ReactNode;
}) {
  const meta = PENDING_META[action.type] ?? { tone: "slate" as const, icon: Users };
  const t = DASHBOARD_TONE[meta.tone];

  return (
    <article
      className="relative overflow-hidden rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: t.border, background: t.wash, boxShadow: NL.shadowCard }}
    >
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: t.accent }} aria-hidden />
      <div className="flex flex-wrap items-start gap-3">
        {toneIcon(meta.icon, meta.tone)}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]"
              style={{ background: t.soft, color: t.iconColor }}
            >
              {actionTypeLabel(action.type)}
            </span>
            <span className="text-[11px]" style={{ color: NL.textMuted }}>
              {relTime}
            </span>
          </div>
          <h4 className="mt-2 text-[14px] font-bold" style={{ color: NL.textPrimary }}>
            {formatPhonesInText(action.title) || action.title}
          </h4>
          <p className="mt-0.5 text-[13px]" style={{ color: NL.textSecondary }}>
            {formatPhonesInText(action.subtitle)}
          </p>
          {action.detail ? (
            <p className="mt-1 truncate text-[12px]" style={{ color: NL.textMuted }}>
              {formatPhonesInText(action.detail)}
            </p>
          ) : null}
        </div>
      </div>
      {children ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: NL.borderCard }}>
          {children}
        </div>
      ) : null}
    </article>
  );
}

export function DashboardActivityItem({
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
  const palette: Record<string, { bg: string; color: string; border: string }> = {
    info: { bg: NL.chipBg, color: NL.brandPrimaryDeep, border: "rgba(27, 79, 138, 0.55)" },
    warning: { bg: "#FFFBEB", color: NL.warning, border: "rgba(253, 230, 138, 0.45)" },
    error: { bg: "#FEF2F2", color: NL.danger, border: "rgba(254, 202, 202, 0.45)" },
    critical: { bg: "#F5F3FF", color: "#7C3AED", border: "rgba(221, 214, 254, 0.55)" },
  };
  const tone = palette[severity] ?? palette.info;

  return (
    <div className="relative pl-6">
      <span
        className="absolute left-0 top-3 h-3 w-3 rounded-full border-2 bg-white"
        style={{ borderColor: tone.color, boxShadow: `0 0 0 4px ${tone.bg}` }}
        aria-hidden
      />
      <div
        className="rounded-xl border bg-white p-3.5 transition hover:shadow-sm"
        style={{ borderColor: tone.border }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold" style={{ color: NL.textPrimary }}>
            {userName}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: tone.bg, color: tone.color }}
          >
            {action.replace(/_/g, " ")}
          </span>
          <span className="text-[11px]" style={{ color: NL.textMuted }}>
            {relTime}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: NL.textSecondary }}>
          {description}
        </p>
      </div>
    </div>
  );
}

export function DashboardQuickAction({
  label,
  href,
  badge,
  tone = "blue",
  icon: Icon,
}: {
  label: string;
  href: string;
  badge?: string;
  tone?: DashboardTone;
  icon: LucideIcon;
}) {
  const t = DASHBOARD_TONE[tone];
  const countMatch = badge?.match(/(\d+)/);

  return (
    <Link
      href={href}
      className="group flex h-full min-h-11 items-center gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition duration-150 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm active:scale-[0.99]"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-[15px] [&_svg]:w-[15px]"
        style={{ background: t.iconBg, color: t.iconColor }}
      >
        <Icon strokeWidth={2.2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-[12px] font-semibold leading-tight text-slate-800">{label}</span>
      {badge && countMatch ? (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
          style={{ background: t.soft, color: t.iconColor }}
          title={badge}
        >
          {countMatch[1]}
        </span>
      ) : null}
      <ChevronRight
        className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
        strokeWidth={2.2}
        aria-hidden
      />
    </Link>
  );
}

export type PendingFilter = "all" | AdminDashboardPendingAction["type"];

export function PendingFilterTabs({
  value,
  onChange,
  counts,
}: {
  value: PendingFilter;
  onChange: (value: PendingFilter) => void;
  counts: Record<PendingFilter, number>;
}) {
  const tabs: { id: PendingFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "membership", label: "Members" },
    { id: "community_admin", label: "Admins" },
    { id: "community_request", label: "Communities" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = value === tab.id;
        const count = counts[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition"
            style={
              active
                ? { background: NL.fillCta, color: "#fff", boxShadow: "0 3px 10px rgba(27, 79, 138, 0.18)" }
                : { background: NL.surfaceMuted, color: NL.textSecondary, border: `1px solid ${NL.borderCard}` }
            }
          >
            {tab.label}
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: active ? "rgba(255,255,255,0.18)" : NL.chipBg, color: active ? "#fff" : NL.brandPrimaryDeep }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
