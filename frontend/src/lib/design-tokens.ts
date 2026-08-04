/**
 * Havena design tokens — Ocean Breeze
 * Five swatches, solid fills only.
 *
 *   #0A2A43  Deep Navy
 *   #0D9488  Deep Teal
 *   #14B8A6  Primary Teal
 *   #D1FAF5  Soft Mint
 *   #F4F8FD  Canvas
 */

export const NL = {
  navy: "#0A2A43",
  deepTeal: "#0D9488",
  teal: "#14B8A6",
  mint: "#D1FAF5",
  canvas: "#F4F8FD",

  brandPrimary: "#14B8A6",
  brandPrimaryDeep: "#0A2A43",

  textPrimary: "#0A2A43",
  textSecondary: "#6B7280",
  textBody: "#0A2A43",
  textMuted: "#6B7280",

  surface: "#FFFFFF",
  surfaceMuted: "#F4F8FD",
  borderCard: "#E5E7EB",
  borderInput: "rgba(20, 184, 166, 0.28)",

  link: "#0A2A43",
  success: "#0D9488",
  warning: "#D97706",
  danger: "#E7000B",

  chipBg: "#D1FAF5",

  fillCta: "#0A2A43",
  fillHero: "#0A2A43",
  fillAuthWash: "#F4F8FD",
  fillSoft: "#D1FAF5",

  shadowCard: "0 2px 8px rgba(10, 42, 67, 0.06)",
  radiusCard: "16px",
  radiusButton: "12px",
} as const;

export const CHART_PRIMARY = NL.teal;
export const CHART_PRIMARY_DEEP = NL.navy;
