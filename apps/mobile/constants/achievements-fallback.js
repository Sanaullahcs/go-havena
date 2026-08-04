const ACHIEVEMENT_IMAGES = {
  earned_card: require("../assets/images/earnd-card.png"),
  community_star: require("../assets/images/cummunity-star.png"),
  social_butterfly: require("../assets/images/social-butterfly.png"),
};

export function getAchievementImage(imageKey) {
  return ACHIEVEMENT_IMAGES[imageKey] ?? ACHIEVEMENT_IMAGES.earned_card;
}

const FALLBACK_LOCKED = [
  {
    key: "month_master",
    title: "Month Master",
    subtitle: "Complete 30 days of wellness activities",
    status_label: "Active for 30 days",
    icon: "calendar-outline",
    icon_color: "#0A2A43",
    icon_bg: "#D1FAF5",
    image_key: "earned_card",
    progress_color: "#14B8A6",
    progress: { current: 0, total: 30, percent: 0 },
  },
  {
    key: "wellness_pro",
    title: "Wellness Pro",
    subtitle: "Complete 10 wellness courses",
    status_label: "Complete 10 courses",
    icon: "school-outline",
    icon_color: "#DC2626",
    icon_bg: "#FEF2F2",
    image_key: "earned_card",
    progress_color: "#FB2C36",
    progress: { current: 0, total: 10, percent: 0 },
  },
  {
    key: "community_star",
    title: "Community Star",
    subtitle: "Share 50 posts with the community",
    status_label: "50 community posts",
    icon: "people-outline",
    icon_color: "#D97706",
    icon_bg: "#FFFBEB",
    image_key: "community_star",
    progress_color: "#FE9A00",
    progress: { current: 0, total: 50, percent: 0 },
  },
  {
    key: "social_butterfly",
    title: "Social Butterfly",
    subtitle: "Attend 5 community events",
    status_label: "Attend 5 events",
    icon: "sparkles-outline",
    icon_color: "#DC2626",
    icon_bg: "#FEF2F2",
    image_key: "social_butterfly",
    progress_color: "#FB2C36",
    progress: { current: 0, total: 5, percent: 0 },
  },
  {
    key: "meditation_master",
    title: "Meditation Master",
    subtitle: "Complete 20 meditation sessions",
    status_label: "20 meditation lessons",
    icon: "leaf-outline",
    icon_color: "#D97706",
    icon_bg: "#FFFBEB",
    image_key: "earned_card",
    progress_color: "#FE9A00",
    progress: { current: 0, total: 20, percent: 0 },
  },
];

function mapRaw(item, earned = false) {
  return {
    id: item.key,
    key: item.key,
    title: item.title,
    subtitle: item.subtitle,
    statusLabel: item.status_label,
    icon: item.icon,
    iconColor: item.icon_color,
    iconBg: item.icon_bg,
    imageKey: item.image_key,
    imageSource: getAchievementImage(item.image_key),
    earned,
    earnedAt: item.earned_at ?? null,
    earnedDateLabel: item.earned_date_label ?? null,
    progressColor: item.progress_color,
    progress: {
      current: item.progress?.current ?? 0,
      total: item.progress?.total ?? 0,
      percent: item.progress?.percent ?? 0,
    },
  };
}

export function mapAchievementResponse(data) {
  const earned = (data.earned ?? []).map((item) => mapRaw(item, true));
  const locked = (data.locked ?? []).map((item) => mapRaw(item, false));

  return {
    earnedCount: data.earned_count ?? earned.length,
    totalCount: data.total_count ?? 8,
    overallProgressPercent: data.overall_progress_percent ?? 0,
    earned,
    locked: locked.length ? locked : FALLBACK_LOCKED.map((item) => mapRaw(item, false)),
    recent: (data.recent ?? []).map((item) => mapRaw(item, true)),
  };
}

export function getFallbackAchievements() {
  const locked = FALLBACK_LOCKED.map((item) => mapRaw(item, false));

  return {
    earnedCount: 0,
    totalCount: 8,
    overallProgressPercent: 0,
    earned: [],
    locked,
    recent: [],
  };
}
