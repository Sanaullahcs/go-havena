import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  Ban,
  Check,
  Download,
  Eye,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

export type AdminActionTone = "neutral" | "primary" | "success" | "warning" | "danger";

export type AdminActionIconName =
  | "view"
  | "edit"
  | "delete"
  | "ban"
  | "approve"
  | "reject"
  | "check"
  | "plus"
  | "escalate"
  | "download";

const ICONS: Record<AdminActionIconName, LucideIcon> = {
  view: Eye,
  edit: Pencil,
  delete: Trash2,
  ban: Ban,
  approve: Check,
  reject: X,
  check: Check,
  plus: Plus,
  escalate: ArrowUp,
  download: Download,
};

const TONE_CLASS: Record<AdminActionTone, string> = {
  neutral:
    "border-[#EDEDED] bg-white text-[#64748B] hover:border-[#CBD5E1] hover:bg-[#F8FAFC] hover:text-[#334155]",
  primary:
    "border-[rgba(0,124,250,0.28)] bg-[#E8F0F7] text-[#1B4F8A] hover:border-[rgba(0,124,250,0.4)] hover:bg-[rgba(27, 79, 138, 0.15)]",
  success:
    "border-[rgba(16,185,129,0.28)] bg-[#ECFDF5] text-[#059669] hover:border-[rgba(16,185,129,0.4)] hover:bg-[#D1FAE5]",
  warning:
    "border-[rgba(217,119,6,0.28)] bg-[#FFFBEB] text-[#D97706] hover:border-[rgba(217,119,6,0.4)] hover:bg-[#FEF3C7]",
  danger:
    "border-[rgba(231,0,11,0.2)] bg-[#FEF2F2] text-[#DC2626] hover:border-[rgba(231,0,11,0.32)] hover:bg-[#FFE4E6]",
};

/** Map legacy table button color names to shared tones */
export function legacyActionTone(color: string): AdminActionTone {
  switch (color) {
    case "blue":
      return "primary";
    case "green":
      return "success";
    case "amber":
      return "warning";
    case "red":
      return "danger";
    default:
      return "neutral";
  }
}

export function AdminActionBtn({
  icon,
  title,
  tone = "neutral",
  onClick,
  disabled,
}: {
  icon: AdminActionIconName;
  title: string;
  tone?: AdminActionTone;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Icon = ICONS[icon];

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-150 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${TONE_CLASS[tone]}`}
    >
      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
    </button>
  );
}

export function AdminActionIcon({ icon, className = "h-4 w-4" }: { icon: AdminActionIconName; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}
