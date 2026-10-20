import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NL } from "@/lib/design-tokens";
import type { DashboardTone } from "@/components/admin/dashboard/dashboard-shared";
import { toneIcon } from "@/components/admin/dashboard/dashboard-theme";

export function DashboardPanel({
  title,
  description,
  icon: Icon,
  tone = "blue",
  action,
  children,
  className = "",
  tall = false,
  compact = false,
  fit = false,
  scrollBody = false,
  fillBody = false,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  tone?: DashboardTone;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tall?: boolean;
  compact?: boolean;
  fit?: boolean;
  /** Equal-height dashboard rows: body fills remaining space and scrolls when content overflows. */
  scrollBody?: boolean;
  /** Equal-height dashboard rows: body fills remaining space; child handles its own scroll. */
  fillBody?: boolean;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white ${fit ? "" : "h-full min-h-0"} ${className}`}
      style={{ borderColor: NL.borderCard, boxShadow: NL.shadowCard }}
    >
      <div
        className={`flex shrink-0 flex-wrap items-start justify-between gap-2 border-b ${compact ? "px-3.5 py-2.5" : "px-5 py-4"}`}
        style={{ borderColor: NL.borderCard, background: "#FFFFFF" }}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon ? toneIcon(Icon, tone, compact ? "sm" : "md") : null}
          <div className="min-w-0">
            <h3 className={`break-words font-bold ${compact ? "text-[13px]" : "text-[15px]"}`} style={{ color: NL.textPrimary }}>
              {title}
            </h3>
            {description ? (
              <p className={`break-words ${compact ? "text-[11px] leading-snug" : "mt-0.5 text-[13px]"}`} style={{ color: NL.textSecondary }}>
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      <div
        className={`flex min-h-0 flex-col overflow-hidden ${fit ? "" : "flex-1"} ${compact ? "p-3" : "p-5"} ${tall ? "min-h-[200px]" : ""}`}
      >
        {scrollBody ? (
          <div className="nl-dashboard-panel-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">{children}</div>
        ) : fillBody ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
