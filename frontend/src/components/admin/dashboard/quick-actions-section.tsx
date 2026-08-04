"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { UserPlus, FileText, Calendar, AlertTriangle } from "lucide-react";

export type QuickActionDef = {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  soft: string;
  onClick: () => void;
};

function ComposeAction({ action }: { action: QuickActionDef }) {
  const Icon = action.icon;

  return (
    <button
      type="button"
      onClick={action.onClick}
      title={action.hint}
      aria-label={action.title}
      className="nl-compose-pill group"
      style={{ "--compose-accent": action.accent, "--compose-soft": action.soft } as CSSProperties}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
      <span className="nl-compose-pill-label">{action.title}</span>
    </button>
  );
}

export function ComposeRail({ actions }: { actions: QuickActionDef[] }) {
  return (
    <div className="nl-compose-rail" role="group" aria-label="Compose">
      {actions.map((action) => (
        <ComposeAction key={action.id} action={action} />
      ))}
    </div>
  );
}

/** @deprecated Use ComposeRail inside DashboardHero instead. */
export default function QuickActionsSection({ actions }: { actions: QuickActionDef[] }) {
  return (
    <section className="nl-compose" aria-label="Compose quick actions">
      <ComposeRail actions={actions} />
    </section>
  );
}

export const COMMUNITY_QUICK_ACTIONS = {
  invite: {
    id: "invite",
    title: "Invite",
    hint: "Send a member invite code",
    icon: UserPlus,
    accent: "#14B8A6",
    soft: "#D1FAF5",
  },
  notice: {
    id: "notice",
    title: "Notice",
    hint: "Post a community announcement",
    icon: FileText,
    accent: "#7C3AED",
    soft: "#F5F3FF",
  },
  event: {
    id: "event",
    title: "Event",
    hint: "Schedule a community event",
    icon: Calendar,
    accent: "#0891B2",
    soft: "#ECFEFF",
  },
  alert: {
    id: "alert",
    title: "Alert",
    hint: "Send an urgent alert",
    icon: AlertTriangle,
    accent: "#EA580C",
    soft: "#FFF7ED",
  },
} as const satisfies Record<string, Omit<QuickActionDef, "onClick">>;
