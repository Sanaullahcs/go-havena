import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import type { DashboardTone } from "@/components/admin/dashboard/dashboard-shared";
import { DASHBOARD_TONE } from "@/components/admin/dashboard/dashboard-theme";
import { NL } from "@/lib/design-tokens";

export function DashboardStatCard({
  label,
  value,
  hint,
  tone = "blue",
  icon: Icon,
  href,
  featured = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: DashboardTone;
  icon: LucideIcon;
  href?: string;
  featured?: boolean;
}) {
  const t = DASHBOARD_TONE[tone];

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex shrink-0 items-center justify-center rounded-xl ${featured ? "h-11 w-11" : "h-10 w-10"}`}
          style={{ background: t.soft, color: t.value }}
        >
          <Icon className={featured ? "h-5 w-5" : "h-[18px] w-[18px]"} strokeWidth={2.25} aria-hidden />
        </span>
        {href ? (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ background: t.soft, color: t.value }}
          >
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        ) : null}
      </div>

      <div className="mt-3 min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: NL.textMuted }}>
          {label}
        </p>
        <p
          className={`mt-0.5 font-bold tabular-nums tracking-tight ${featured ? "text-[2rem] leading-none" : "text-2xl leading-none"}`}
          style={{ color: NL.textPrimary }}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1.5 truncate text-[12px] leading-snug" style={{ color: NL.textSecondary }}>
            {hint}
          </p>
        ) : null}
      </div>

      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-xl opacity-80"
        style={{ background: t.value }}
        aria-hidden
      />
    </>
  );

  const className = [
    "group relative block h-full w-full min-w-0 overflow-hidden rounded-xl border bg-white transition-all duration-200",
    "hover:border-[rgba(0,124,250,0.35)] hover:shadow-md",
    featured ? "p-5" : "p-4",
  ].join(" ");

  const style = {
    borderColor: NL.borderCard,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  };

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={className} style={style}>
      {inner}
    </div>
  );
}
