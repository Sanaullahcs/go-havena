/**
 * Havena Brand Template — Ocean Breeze
 *
 * Calm, flat, solid-color system. No gradients. No glow. No decorative noise.
 *
 * Five swatches:
 *   #1B4F8A  Deep Navy     — hero bg, headings, primary text, CTAs
 *   #0D9488  Deep Teal     — secondary accent, success, chip text
 *   #14B8A6  Primary Teal  — active nav, FAB, accent highlights
 *   #D1FAF5  Soft Mint     — icon wells, chip bg, soft surfaces
 *   #F4F8FD  Canvas        — page background
 *
 * Supporting neutrals:
 *   #FFFFFF  White         — cards, surfaces
 *   #6B7280  Medium Gray   — secondary text, muted labels
 *   #E5E7EB  Border        — card edges, input borders
 */

export const OceanBreezeBrand = {
  id: "ocean-breeze",
  name: "Ocean Breeze",
  tagline: "Calm & Refreshing",
  status: "active",
  appliedScope: ["login", "signup", "home", "frontend"],

  swatches: {
    navy:      "#1B4F8A",
    deepTeal:  "#0D9488",
    teal:      "#14B8A6",
    mint:      "#D1FAF5",
    canvas:    "#F4F8FD",
  },

  neutrals: {
    white:     "#FFFFFF",
    gray:      "#6B7280",
    border:    "#E5E7EB",
  },

  semantic: {
    text:    { primary: "#1B4F8A", secondary: "#6B7280", onDark: "#FFFFFF" },
    surface: { page: "#F4F8FD", card: "#FFFFFF", soft: "#D1FAF5", hero: "#1B4F8A" },
    border:  { default: "#E5E7EB", soft: "rgba(10, 42, 67, 0.06)" },
    state:   { success: "#0D9488", warning: "#D97706", danger: "#E11D48" },
    nav:     { active: "#14B8A6", inactive: "#6B7280", fab: "#14B8A6" },
  },

  usageRatio: {
    canvasAndWhite: 0.70,
    deepNavy:       0.12,
    teals:          0.13,
    mint:           0.05,
  },

  rules: {
    allowGradients: false,
    allowGlow: false,
    preferSolidFills: true,
    preferLineIcons: true,
    notes: [
      "Hero and CTAs use solid fills only.",
      "Primary teal (#14B8A6) is the loudest accent — use sparingly.",
      "Deep navy (#1B4F8A) owns text, hero bg, and CTA buttons.",
      "Canvas (#F4F8FD) is page bg; cards stay pure white.",
      "Soft mint (#D1FAF5) for chips, icon wells, soft surfaces.",
      "No stacked shadows, neon edges, or decorative blobs.",
    ],
  },
};

export default OceanBreezeBrand;
