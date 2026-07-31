/** Community feed / social post tag themes — shared across feed screens. */
export const FEED_TAG_THEME = {
  Recommendations: {
    bg: "#F5F3FF",
    border: "#DDD6FE",
    text: "#7C3AED",
    accent: "#8B5CF6",
    icon: "star",
  },
  Events: {
    bg: "#FFF7ED",
    border: "#FED7AA",
    text: "#C2410C",
    accent: "#F97316",
    icon: "calendar",
  },
  Help: {
    bg: "#ECFDF5",
    border: "#A7F3D0",
    text: "#047857",
    accent: "#10B981",
    icon: "help-circle",
  },
  Neighborhood: {
    bg: "#EFF6FF",
    border: "#BFDBFE",
    text: "#1D4ED8",
    accent: "#3B82F6",
    icon: "map-pin",
  },
  Announcements: {
    bg: "#FFFBEB",
    border: "#FDE68A",
    text: "#B45309",
    accent: "#F59E0B",
    icon: "bell",
  },
};

export const FEED_DEFAULT_THEME = {
  bg: "#F8FAFC",
  border: "#E2E8F0",
  text: "#475569",
  accent: "#64748B",
  icon: "message-circle",
};

export function getFeedTagTheme(tag) {
  if (!tag) return FEED_DEFAULT_THEME;
  return FEED_TAG_THEME[tag] ?? FEED_DEFAULT_THEME;
}
