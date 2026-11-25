import { Colors } from "./tokens";

/**
 * Wellness — brand-led, minimal, no gradients.
 * Chrome stays Havena blue; pillars use restrained accents.
 */
export const WellnessTheme = {
  screenBg: "#F8FAFC",
  surface: "#FFFFFF",
  brand: Colors.brandPrimaryDeep,
  brandSoft: "#d1faf5",
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
    bg: "#d1faf5",
    border: "#DBEAFE",
    tipKey: "wellness.tips.weight",
    tipIcon: "sun",
    titleKey: "wellness.categories.weight",
  },
  exercise: {
    icon: "zap",
    color: "#0F766E",
    bg: "#F0FDFA",
    border: "#CCFBF1",
    tipKey: "wellness.tips.exercise",
    tipIcon: "zap",
    titleKey: "wellness.categories.exercise",
  },
  learning: {
    icon: "book-open",
    color: "#0369A1",
    bg: "#F0F9FF",
    border: "#BAE6FD",
    tipKey: "wellness.tips.learning",
    tipIcon: "book-open",
    titleKey: "wellness.categories.learning",
  },
  stress: {
    icon: "wind",
    color: "#4338CA",
    bg: "#d1faf5",
    border: "#C7D2FE",
    tipKey: "wellness.tips.stress",
    tipIcon: "wind",
    titleKey: "wellness.categories.stress",
  },
  social: {
    icon: "users",
    color: "#C2410C",
    bg: "#FFF7ED",
    border: "#FED7AA",
    tipKey: "wellness.tips.social",
    tipIcon: "users",
    titleKey: "wellness.categories.social",
  },
  nutrition: {
    icon: "coffee",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
    tipKey: "wellness.tips.nutrition",
    tipIcon: "coffee",
    titleKey: "wellness.categories.nutrition",
  },
  sleep: {
    icon: "moon",
    color: "#4338CA",
    bg: "#d1faf5",
    border: "#C7D2FE",
    tipKey: "wellness.tips.sleep",
    tipIcon: "moon",
    titleKey: "wellness.categories.sleep",
  },
  mindful: {
    icon: "heart",
    color: Colors.brandPrimaryDeep,
    bg: "#d1faf5",
    border: "#DBEAFE",
    tipKey: "wellness.tips.mindful",
    tipIcon: "heart",
    titleKey: "wellness.categories.mindful",
  },
};

const DEFAULT_META = {
  icon: "heart",
  color: Colors.brandPrimaryDeep,
  bg: "#d1faf5",
  border: "#DBEAFE",
  tip: "Explore at your own pace.",
  tipIcon: "heart",
};

export function getWellnessCategoryMeta(categoryKey) {
  const key = String(categoryKey ?? "learning").toLowerCase();
  return WELLNESS_CATEGORY_META[key] ?? DEFAULT_META;
}

export const WELLNESS_STAT_THEMES = {
  courses: { icon: "book-open", color: Colors.brandPrimaryDeep, soft: "#d1faf5" },
  progress: { icon: "trending-up", color: "#0F766E", soft: "#F0FDFA" },
  week: { icon: "calendar", color: "#0369A1", soft: "#F0F9FF" },
};
