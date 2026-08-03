import { Colors } from "./tokens";

/**
 * Wellness — brand-led, minimal, no gradients.
 * Chrome stays Havena blue; pillars use restrained accents.
 */
export const WellnessTheme = {
  screenBg: "#F8FAFC",
  surface: "#FFFFFF",
  brand: Colors.brandPrimaryDeep,
  brandSoft: "#EFF6FF",
  brandBorder: "#DBEAFE",
  text: "#0F172A",
  textMuted: "#64748B",
  caption: "#94A3B8",
  border: "#E2E8F0",
  progressTrack: "#F1F5F9",
};

/** Soft pillar accents — professional, not neon. */
export const WELLNESS_CATEGORY_META = {
  weight: {
    icon: "target",
    color: Colors.brandPrimaryDeep,
    bg: "#EFF6FF",
    border: "#DBEAFE",
    tip: "Small daily choices compound — start with one lesson today.",
    tipIcon: "sun",
  },
  exercise: {
    icon: "zap",
    color: "#0F766E",
    bg: "#F0FDFA",
    border: "#CCFBF1",
    tip: "Consistency beats intensity. Move a little every day.",
    tipIcon: "zap",
  },
  learning: {
    icon: "book-open",
    color: "#0369A1",
    bg: "#F0F9FF",
    border: "#BAE6FD",
    tip: "Learn one idea, then put it into practice.",
    tipIcon: "book-open",
  },
  stress: {
    icon: "wind",
    color: "#4338CA",
    bg: "#EEF2FF",
    border: "#C7D2FE",
    tip: "Breathe first. Calm minds make clearer choices.",
    tipIcon: "wind",
  },
  social: {
    icon: "users",
    color: "#C2410C",
    bg: "#FFF7ED",
    border: "#FED7AA",
    tip: "Connection is a wellness habit too — reach out.",
    tipIcon: "users",
  },
  nutrition: {
    icon: "coffee",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
    tip: "Fuel your body with intention, not restriction.",
    tipIcon: "coffee",
  },
  sleep: {
    icon: "moon",
    color: "#4338CA",
    bg: "#EEF2FF",
    border: "#C7D2FE",
    tip: "Protect your wind-down — rest powers everything else.",
    tipIcon: "moon",
  },
  mindful: {
    icon: "heart",
    color: Colors.brandPrimaryDeep,
    bg: "#EFF6FF",
    border: "#DBEAFE",
    tip: "Presence is practice. Give yourself a quiet minute.",
    tipIcon: "heart",
  },
};

const DEFAULT_META = {
  icon: "heart",
  color: Colors.brandPrimaryDeep,
  bg: "#EFF6FF",
  border: "#DBEAFE",
  tip: "Explore at your own pace.",
  tipIcon: "heart",
};

export function getWellnessCategoryMeta(categoryKey) {
  const key = String(categoryKey ?? "learning").toLowerCase();
  return WELLNESS_CATEGORY_META[key] ?? DEFAULT_META;
}

export const WELLNESS_STAT_THEMES = {
  courses: { icon: "book-open", color: Colors.brandPrimaryDeep, soft: "#EFF6FF" },
  progress: { icon: "trending-up", color: "#0F766E", soft: "#F0FDFA" },
  week: { icon: "calendar", color: "#0369A1", soft: "#F0F9FF" },
};
