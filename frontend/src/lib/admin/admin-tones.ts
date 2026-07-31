import { NL } from "@/lib/design-tokens";

/** Shared admin/dashboard tone palette — soft washes, muted accents, not flat gray */
export type AdminTone = "blue" | "green" | "amber" | "red" | "slate" | "violet" | "cyan" | "emerald";

export type AdminToneStyle = {
  accent: string;
  iconBg: string;
  iconColor: string;
  wash: string;
  border: string;
  soft: string;
  value: string;
};

export const ADMIN_TONE: Record<AdminTone, AdminToneStyle> = {
  blue: {
    accent: NL.brandPrimary,
    iconBg: "#EFF6FF",
    iconColor: NL.brandPrimaryDeep,
    wash: "linear-gradient(165deg, #F8FBFF 0%, #FFFFFF 55%)",
    border: "rgba(190, 219, 255, 0.45)",
    soft: NL.chipBg,
    value: NL.textPrimary,
  },
  green: {
    accent: "#10B981",
    iconBg: "#ECFDF5",
    iconColor: "#047857",
    wash: "linear-gradient(165deg, #F6FEF9 0%, #FFFFFF 55%)",
    border: "rgba(167, 243, 208, 0.45)",
    soft: "#ECFDF5",
    value: NL.textPrimary,
  },
  emerald: {
    accent: "#10B981",
    iconBg: "#ECFDF5",
    iconColor: "#047857",
    wash: "linear-gradient(165deg, #F6FEF9 0%, #FFFFFF 55%)",
    border: "rgba(167, 243, 208, 0.45)",
    soft: "#ECFDF5",
    value: NL.textPrimary,
  },
  amber: {
    accent: NL.warning,
    iconBg: "#FFFBEB",
    iconColor: "#B45309",
    wash: "linear-gradient(165deg, #FFFCF5 0%, #FFFFFF 55%)",
    border: "rgba(253, 230, 138, 0.5)",
    soft: "#FFFBEB",
    value: NL.textPrimary,
  },
  red: {
    accent: NL.danger,
    iconBg: "#FEF2F2",
    iconColor: "#B91C1C",
    wash: "linear-gradient(165deg, #FFF8F8 0%, #FFFFFF 55%)",
    border: "rgba(254, 202, 202, 0.45)",
    soft: "#FEF2F2",
    value: NL.textPrimary,
  },
  violet: {
    accent: "#7C3AED",
    iconBg: "#F5F3FF",
    iconColor: "#6D28D9",
    wash: "linear-gradient(165deg, #FAF8FF 0%, #FFFFFF 55%)",
    border: "rgba(221, 214, 254, 0.55)",
    soft: "#F5F3FF",
    value: NL.textPrimary,
  },
  cyan: {
    accent: "#0891B2",
    iconBg: "#ECFEFF",
    iconColor: "#0E7490",
    wash: "linear-gradient(165deg, #F5FEFF 0%, #FFFFFF 55%)",
    border: "rgba(165, 243, 252, 0.45)",
    soft: "#ECFEFF",
    value: NL.textPrimary,
  },
  slate: {
    accent: "#64748B",
    iconBg: "#F1F5F9",
    iconColor: "#475569",
    wash: "linear-gradient(165deg, #F8FAFC 0%, #FFFFFF 55%)",
    border: NL.borderCard,
    soft: "#F1F5F9",
    value: NL.textPrimary,
  },
};

export const ADMIN_BADGE_CLASS: Record<AdminTone, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  green: "bg-emerald-50 text-emerald-700 border-emerald-100",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  amber: "bg-amber-50 text-amber-800 border-amber-100",
  red: "bg-rose-50 text-rose-700 border-rose-100",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  violet: "bg-violet-50 text-violet-700 border-violet-100",
  cyan: "bg-cyan-50 text-cyan-800 border-cyan-100",
};
