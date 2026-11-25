/**
 * Havena design tokens — Ocean Breeze
 * Official palette. Solid fills only (no brand gradients).
 *
 *   #0A2A43  Deep Navy — text, nav, hero fills
 *   #0D9488  Dark Teal — secondary icons / accent text
 *   #14B8A6  Primary Teal — CTAs, highlights
 *   #D1FAF5  Soft Mint — chips, soft surfaces
 *   #F4F8FD  Canvas — page background
 *   #FFFFFF  White — cards / surfaces
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
  textSecondary: "rgba(10, 42, 67, 0.62)",
  textBody: "#0A2A43",
  textMuted: "rgba(10, 42, 67, 0.45)",

  surface: "#FFFFFF",
  surfaceMuted: "#F4F8FD",
  borderCard: "rgba(10, 42, 67, 0.10)",
  borderInput: "rgba(10, 42, 67, 0.18)",

  link: "#0D9488",
  success: "#0D9488",
  warning: "#0D9488",
  danger: "#0A2A43",

  chipBg: "#D1FAF5",

  fillCta: "#14B8A6",
  fillHero: "#0A2A43",
  fillAuthWash: "#F4F8FD",
  fillSoft: "#D1FAF5",

  shadowCard: "0 2px 8px rgba(10, 42, 67, 0.06)",
  radiusCard: "16px",
  radiusButton: "12px",
} as const;

export const CHART_PRIMARY = NL.teal;
export const CHART_PRIMARY_DEEP = NL.navy;
