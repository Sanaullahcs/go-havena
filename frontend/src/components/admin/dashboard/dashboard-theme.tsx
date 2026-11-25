import type { LucideIcon } from "lucide-react";
import { NL } from "@/lib/design-tokens";
import { ADMIN_TONE, type AdminTone } from "@/lib/admin/admin-tones";
import type { DashboardTone } from "@/components/admin/dashboard/dashboard-shared";

export const DASHBOARD_TONE = ADMIN_TONE as Record<
  DashboardTone,
  (typeof ADMIN_TONE)[AdminTone]
>;

/** Soft Lucide icon chip — tinted, minimal border */
export function toneIcon(Icon: LucideIcon, tone: DashboardTone, size: "sm" | "md" | "lg" = "md") {
  const t = DASHBOARD_TONE[tone] ?? DASHBOARD_TONE.green;
  const dim =
    size === "lg"
      ? "h-10 w-10 rounded-xl [&_svg]:h-[18px] [&_svg]:w-[18px]"
      : size === "sm"
        ? "h-7 w-7 rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5"
        : "h-9 w-9 rounded-lg [&_svg]:h-4 [&_svg]:w-4";
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${dim}`}
      style={{ background: t.iconBg, color: t.iconColor }}
    >
      <Icon strokeWidth={2} aria-hidden />
    </span>
  );
}
