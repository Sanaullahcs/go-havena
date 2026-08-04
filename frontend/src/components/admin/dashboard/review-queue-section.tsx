"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ShoppingBag,
  UserPlus,
  FileText,
  Calendar,
  AlertTriangle,
  Building2,
  X,
} from "lucide-react";
import type { AdminDashboardPendingAction } from "@/lib/api/dashboard";
import { actionTypeLabel } from "@/components/admin/dashboard/dashboard-shared";
import type { DashboardTone } from "@/components/admin/dashboard/dashboard-shared";

const TYPE_META: Record<
  AdminDashboardPendingAction["type"],
  { tone: DashboardTone; icon: LucideIcon; accent: string; soft: string }
> = {
  membership: { tone: "amber", icon: UserPlus, accent: "#F59E0B", soft: "#FFFBEB" },
  family_add_member: { tone: "amber", icon: UserPlus, accent: "#F59E0B", soft: "#FFFBEB" },
  community_admin: { tone: "violet", icon: UserPlus, accent: "#8B5CF6", soft: "#F5F3FF" },
  post: { tone: "blue", icon: FileText, accent: "#14B8A6", soft: "#D1FAF5" },
  listing: { tone: "green", icon: ShoppingBag, accent: "#10B981", soft: "#ECFDF5" },
  notice: { tone: "violet", icon: FileText, accent: "#7C3AED", soft: "#F5F3FF" },
  event: { tone: "cyan", icon: Calendar, accent: "#06B6D4", soft: "#ECFEFF" },
  alert: { tone: "red", icon: AlertTriangle, accent: "#EF4444", soft: "#FEF2F2" },
  community_request: { tone: "violet", icon: Building2, accent: "#6366F1", soft: "#D1FAF5" },
};

function ReviewQueueRow({
  action,
  relTime,
  busy,
  canInline,
  onApprove,
  onReject,
}: {
  action: AdminDashboardPendingAction;
  relTime: string;
  busy: boolean;
  canInline: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const meta = TYPE_META[action.type] ?? {
    tone: "slate" as const,
    icon: FileText,
    accent: "#64748B",
    soft: "#F8FAFC",
  };
  const Icon = meta.icon;

  return (
    <article className="group relative grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-slate-100 px-5 py-3.5 transition first:border-t-0 hover:bg-slate-50/80">
      <span
        className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        style={{ background: meta.accent }}
        aria-hidden
      />

      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: meta.soft, color: meta.accent }}
      >
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate text-[13.5px] font-semibold text-slate-900">{action.title}</p>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            {actionTypeLabel(action.type)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-slate-500">
          {[action.subtitle, action.detail].filter(Boolean).join(" · ")}
        </p>
      </div>

      <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">{relTime}</span>

      <div className="flex items-center gap-1.5 opacity-55 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {canInline ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
              aria-label={`Reject ${action.title}`}
              title="Reject"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gradient-to-br from-[#14B8A6] to-[#14B8A6] text-white shadow-md shadow-blue-500/25 transition hover:shadow-lg hover:shadow-blue-500/35 disabled:cursor-not-allowed disabled:opacity-45"
              aria-label={action.type === "post" ? `Publish ${action.title}` : `Approve ${action.title}`}
              title={action.type === "post" ? "Publish" : "Approve"}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </>
        ) : null}
        <Link
          href={action.action_href}
          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          aria-label={action.action_label}
          title={action.action_label}
        >
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </Link>
      </div>
    </article>
  );
}

export default function ReviewQueueSection({
  items,
  relTime,
  inlineTypes,
  actionId,
  onApprove,
  onReject,
}: {
  items: AdminDashboardPendingAction[];
  relTime: (ts: string) => string;
  inlineTypes: Set<AdminDashboardPendingAction["type"]>;
  actionId: number | null;
  onApprove: (action: AdminDashboardPendingAction) => void;
  onReject: (action: AdminDashboardPendingAction) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-gradient-to-b from-[#fcfdff] to-white shadow-sm">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 pb-3.5 pt-4.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Inbox</p>
          <h3 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">Review queue</h3>
        </div>
        {items.length > 0 ? (
          <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-700 ring-1 ring-orange-200/60">
            {items.length} waiting
          </span>
        ) : (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200/60">
            All clear
          </span>
        )}
      </header>

      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 px-5 py-5">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" strokeWidth={2} aria-hidden />
          <p className="text-[13px] font-medium text-slate-600">Nothing needs your attention right now.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((action) => (
            <ReviewQueueRow
              key={`${action.type}-${action.id}`}
              action={action}
              relTime={relTime(action.created_at)}
              busy={actionId === action.id}
              canInline={inlineTypes.has(action.type)}
              onApprove={() => onApprove(action)}
              onReject={() => onReject(action)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
