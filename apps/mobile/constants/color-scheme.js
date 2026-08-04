/**
 * Havena official color scheme (mobile) — Ocean Breeze
 * Canonical spec: ../../design/color-scheme.js
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
    /** aliases for older screens */
    brightTurquoise: "#0D9488",
    vibrantGreen: "#0D9488",
  },

  secondary: {
    navy: "#0A2A43",
    darkTeal: "#0D9488",
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

export const HavenaColorFlat = {
  ...HavenaColors.primary,
  ...HavenaColors.secondary,
  ...HavenaColors.neutral,
};

export default HavenaColors;
