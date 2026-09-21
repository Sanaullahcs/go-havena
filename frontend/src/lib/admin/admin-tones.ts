import { NL } from "@/lib/design-tokens";

/** Shared admin/dashboard tone palette — soft washes, muted accents, not flat gray */
export type AdminTone = "blue" | "green" | "amber" | "red" | "slate" | "violet" | "cyan" | "emerald" | "teal";

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
    iconBg: NL.mint,
    iconColor: NL.brandPrimaryDeep,
    wash: "#FFFFFF",
    border: "rgba(10, 42, 67, 0.12)",
    soft: NL.chipBg,
    value: NL.textPrimary,
  },
  green: {
    accent: NL.deepTeal,
    iconBg: NL.mint,
    iconColor: NL.deepTeal,
    wash: "#FFFFFF",
    border: "rgba(13, 148, 136, 0.22)",
    soft: NL.mint,
    value: NL.textPrimary,
  },
  emerald: {
    accent: NL.teal,
    iconBg: NL.mint,
    iconColor: NL.deepTeal,
    wash: "#FFFFFF",
    border: "rgba(20, 184, 166, 0.28)",
    soft: NL.mint,
    value: NL.textPrimary,
  },
  teal: {
    accent: NL.teal,
    iconBg: NL.mint,
    iconColor: NL.deepTeal,
    wash: "#FFFFFF",
    border: "rgba(20, 184, 166, 0.28)",
    soft: NL.mint,
    value: NL.textPrimary,
  },
  amber: {
    accent: NL.warning,
    iconBg: "#FFFBEB",
    iconColor: "#B45309",
    wash: "#FFFFFF",
    border: "rgba(253, 230, 138, 0.5)",
    soft: "#FFFBEB",
    value: NL.textPrimary,
  },
  red: {
    accent: NL.danger,
    iconBg: "#FEF2F2",
    iconColor: "#B91C1C",
    wash: "#FFFFFF",
    border: "rgba(254, 202, 202, 0.45)",
    soft: "#FEF2F2",
    value: NL.textPrimary,
  },
  violet: {
    accent: "#7C3AED",
    iconBg: "#F5F3FF",
    iconColor: "#6D28D9",
    wash: "#FFFFFF",
    border: "rgba(221, 214, 254, 0.55)",
    soft: "#F5F3FF",
    value: NL.textPrimary,
  },
  cyan: {
    accent: "#0891B2",
    iconBg: "#ECFEFF",
    iconColor: "#0E7490",
    wash: "#FFFFFF",
    border: "rgba(165, 243, 252, 0.45)",
    soft: "#ECFEFF",
    value: NL.textPrimary,
  },
  slate: {
    accent: "#64748B",
    iconBg: "#F1F5F9",
    iconColor: "#475569",
    wash: "#FFFFFF",
    border: NL.borderCard,
    soft: "#F1F5F9",
    value: NL.textPrimary,
  },
};

export const ADMIN_BADGE_CLASS: Record<AdminTone, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-100",
  green: "bg-[#D1FAF5] text-[#0D9488] border-[#D1FAF5]",
  emerald: "bg-[#D1FAF5] text-[#0D9488] border-[#D1FAF5]",
  teal: "bg-[#D1FAF5] text-[#0D9488] border-[#D1FAF5]",
  amber: "bg-amber-50 text-amber-800 border-amber-100",
  red: "bg-rose-50 text-rose-700 border-rose-100",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  violet: "bg-violet-50 text-violet-700 border-violet-100",
  cyan: "bg-cyan-50 text-cyan-800 border-cyan-100",
};
