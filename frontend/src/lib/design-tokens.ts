/** Havena design tokens — Ocean Breeze (solid fills only, no gradients). */

export const NL = {
  brandPrimary: "#14B8A6",
  brandPrimaryDeep: "#0A2A43",
  brandSecondaryTeal: "#0D9488",
  brandSecondaryTurquoise: "#0D9488",
  brandSecondaryGreen: "#0D9488",
  brandSeaGreen: "#14B8A6",
  brandFresh: "#0D9488",

  textPrimary: "#0A2A43",
  textSecondary: "#6B7280",
  textBody: "#0A2A43",
  textMuted: "#6B7280",

  surface: "#FFFFFF",
  surfaceMuted: "#F4F8FD",
  borderCard: "#E5E7EB",
  borderInput: "rgba(20, 184, 166, 0.28)",

  link: "#14B8A6",
  success: "#0D9488",
  warning: "#D97706",
  danger: "#E7000B",

  canvas: "#F4F8FD",
  chipBg: "#D1FAF5",

  /** Solid fills — use instead of gradient* tokens */
  fillCta: "#14B8A6",
  fillHero: "#0A2A43",
  fillAuthWash: "#F4F8FD",
  fillSoft: "#D1FAF5",

  /** @deprecated Use fillCta — solid only */
  gradientCta: "#14B8A6",
  /** @deprecated Use fillHero — solid only */
  gradientHero: "#0A2A43",

  shadowCard: "0 2px 8px rgba(10, 42, 67, 0.06)",
  radiusCard: "16px",
  radiusButton: "12px",
} as const;

export const CHART_PRIMARY = NL.brandPrimary;
export const CHART_PRIMARY_DEEP = NL.brandPrimaryDeep;
