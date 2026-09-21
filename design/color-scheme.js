/**
 * Havena official color scheme — Ocean Breeze
 * Single source of truth. Solid fills only (no gradients).
 *
 *   #0A2A43  Deep navy — text, nav icons, hero fills
 *   #0D9488  Dark teal — secondary icons / accent text
 *   #14B8A6  Primary teal — CTAs, FAB, highlights
 *   #D1FAF5  Soft mint — chips, soft surfaces
 *   #F4F8FD  Canvas — app / page background
 *
 * Usage:
 *   Mobile:  import { HavenaColors } from "../constants/color-scheme";
 *   Web:     import { HavenaColors } from "../../../design/color-scheme";
 */

/** @type {const} */
export const HavenaColors = {
  primary: {
    main: "#14B8A6",
    teal: "#14B8A6",
    darkNavy: "#0A2A43",
    darkTeal: "#0D9488",
    softMint: "#D1FAF5",
    canvas: "#F4F8FD",
  },

  secondary: {
    navy: "#0A2A43",
    darkTeal: "#0D9488",
    /** @deprecated Prefer darkTeal — kept for older imports */
    turquoise: "#0D9488",
    green: "#0D9488",
  },

  neutral: {
    darkText: "#0A2A43",
    mediumGray: "#6B7280",
    lightGray: "#E5E7EB",
    background: "#F4F8FD",
    white: "#FFFFFF",
  },
};

/** Flat map for Tailwind / StyleSheet convenience */
export const HavenaColorFlat = {
  ...HavenaColors.primary,
  ...HavenaColors.secondary,
  ...HavenaColors.neutral,
};

export default HavenaColors;
