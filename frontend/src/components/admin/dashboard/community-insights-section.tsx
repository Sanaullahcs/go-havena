"use client";

import type { ReactNode } from "react";
import { TrendingUp, Users } from "lucide-react";
import {
  DashboardMembersBarChart,
  DashboardMembersPieChart,
} from "@/components/admin/dashboard/dashboard-charts";

function InsightCard({
  eyebrow,
  title,
  badge,
  icon: Icon,
  accent,
  soft,
  children,
}: {
  eyebrow: string;
  title: string;
  badge?: string;
  icon: typeof TrendingUp;
  accent: string;
  soft: string;
  children: ReactNode;
}) {
  return (
    <section className="nl-insight-card">
      <header className="nl-insight-card-head">
        <div className="flex min-w-0 items-start gap-3">
          <span className="nl-insight-card-icon" style={{ background: soft, color: accent }}>
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{eyebrow}</p>
            <h3 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">{title}</h3>
          </div>
        </div>
        {badge ? <span className="nl-insight-card-badge">{badge}</span> : null}
      </header>
      <div className="nl-insight-card-body">{children}</div>
    </section>
  );
}

export default function CommunityInsightsSection({
  memberGrowth,
  memberStatus,
}: {
  memberGrowth?: { month: string; count: number }[];
  memberStatus?: { status: string; count: number }[];
}) {
  const totalNew = (memberGrowth ?? []).reduce((sum, row) => sum + row.count, 0);
  const totalMembers = (memberStatus ?? []).reduce((sum, row) => sum + row.count, 0);
  const pending =
    (memberStatus ?? []).find((row) => row.status === "pending")?.count ?? 0;

  return (
    <div className="nl-insights-grid">
      <InsightCard
        eyebrow="Growth"
        title="Member growth"
        badge={totalNew > 0 ? `+${totalNew} new` : "No growth yet"}
        icon={TrendingUp}
        accent="#7C3AED"
        soft="#F5F3FF"
      >
        <DashboardMembersBarChart data={memberGrowth} variant="minimal" />
      </InsightCard>

      <InsightCard
        eyebrow="Snapshot"
        title="Membership mix"
        badge={pending > 0 ? `${pending} pending` : `${totalMembers} total`}
        icon={Users}
        accent="#059669"
        soft="#ECFDF5"
      >
        <DashboardMembersPieChart data={memberStatus} variant="minimal" />
      </InsightCard>
    </div>
  );
}
