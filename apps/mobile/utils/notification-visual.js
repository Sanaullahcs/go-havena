const ICON_ASSETS = {
  badge: require("../assets/images/badge-earned.png"),
  comment: require("../assets/images/comments.png"),
  reminder: require("../assets/images/reminder.png"),
  like: require("../assets/images/like-post.png"),
  course: require("../assets/images/courses.png"),
  message: require("../assets/images/comments.png"),
};

const DEFAULT_VISUAL = {
  ionicon: "notifications-outline",
  assetKey: "reminder",
  color: "#1B4F8A",
  bg: "#D1FAF5",
};

const KIND_VISUALS = {
  post_created: {
    ionicon: "newspaper-outline",
    assetKey: "reminder",
    color: "#1B4F8A",
    bg: "#D1FAF5",
  },
  post_comment: {
    ionicon: "chatbubbles-outline",
    assetKey: "comment",
    color: "#1B4F8A",
    bg: "#D1FAF5",
  },
  post_comment_reply: {
    ionicon: "return-down-forward-outline",
    assetKey: "comment",
    color: "#1B4F8A",
    bg: "#D1FAF5",
  },
  post_like: {
    ionicon: "heart",
    assetKey: "like",
    color: "#E11D48",
    bg: "#FFF1F2",
  },
  post_moderation: {
    ionicon: "shield-checkmark-outline",
    assetKey: "reminder",
    color: "#D97706",
    bg: "#FFFBEB",
  },
  message: {
    ionicon: "chatbubble-ellipses-outline",
    assetKey: null,
    color: "#1B4F8A",
    bg: "#D1FAF5",
  },
  new_message: {
    ionicon: "chatbubble-ellipses-outline",
    assetKey: null,
    color: "#1B4F8A",
    bg: "#D1FAF5",
  },
  listing: {
    ionicon: "pricetag-outline",
    assetKey: null,
    color: "#14B8A6",
    bg: "#D1FAF5",
  },
  neighbor: {
    ionicon: "chatbubble-outline",
    assetKey: null,
    color: "#1B4F8A",
    bg: "#D1FAF5",
  },
  community_request: {
    ionicon: "people-outline",
    assetKey: "reminder",
    color: "#7C3AED",
    bg: "#F5F3FF",
  },
  membership_approval: {
    ionicon: "checkmark-circle-outline",
    assetKey: "badge",
    color: "#059669",
    bg: "#ECFDF5",
  },
  test_push: {
    ionicon: "notifications-outline",
    assetKey: "reminder",
    color: "#1B4F8A",
    bg: "#D1FAF5",
  },
};

function buildVisual(config) {
  const next = config ?? DEFAULT_VISUAL;
  return {
    ionicon: next.ionicon,
    iconSource: next.assetKey ? ICON_ASSETS[next.assetKey] ?? null : null,
    iconColor: next.color,
    iconBackground: next.bg,
  };
}

function matchHaystackVisual(haystack) {
  if (haystack.includes("badge") || haystack.includes("earned") || haystack.includes("membership approved")) {
    return buildVisual(KIND_VISUALS.membership_approval);
  }
  if (
    haystack.includes("new message") ||
    haystack.includes("sent you a message") ||
    haystack.includes("new offer") ||
    haystack.includes("offer received") ||
    haystack.includes("offered $")
  ) {
    return buildVisual(KIND_VISUALS.message);
  }
  if (
    haystack.includes("new community post") ||
    haystack.includes("shared a new post")
  ) {
    return buildVisual(KIND_VISUALS.post_created);
  }
  if (
    haystack.includes("post reaction") ||
    haystack.includes("liked your post") ||
    haystack.includes(" liked")
  ) {
    return buildVisual(KIND_VISUALS.post_like);
  }
  if (
    haystack.includes("new reply") ||
    haystack.includes("replied to your comment") ||
    haystack.includes("replied on your post")
  ) {
    return buildVisual(KIND_VISUALS.post_comment_reply);
  }
  if (
    haystack.includes("new comment") ||
    haystack.includes("commented on your post") ||
    haystack.includes("comment") ||
    haystack.includes("replied")
  ) {
    return buildVisual(KIND_VISUALS.post_comment);
  }
  if (haystack.includes("wellness") || haystack.includes("course")) {
    return buildVisual({
      ionicon: "fitness-outline",
      assetKey: "course",
      color: "#059669",
      bg: "#ECFDF5",
    });
  }
  if (
    haystack.includes("guest approval") ||
    haystack.includes("approve or reject guest") ||
    haystack.includes("guest invitation")
  ) {
    return buildVisual({
      ionicon: "person-add-outline",
      assetKey: "reminder",
      color: "#D97706",
      bg: "#FFFBEB",
    });
  }
  if (
    haystack.includes("listing approved") ||
    haystack.includes("listing rejected") ||
    haystack.includes("marketplace")
  ) {
    return buildVisual({
      ionicon: "storefront-outline",
      assetKey: "reminder",
      color: "#14B8A6",
      bg: "#D1FAF5",
    });
  }
  if (
    haystack.includes("post approved") ||
    haystack.includes("post not approved") ||
    haystack.includes("moderation")
  ) {
    return buildVisual({
      ionicon: "shield-checkmark-outline",
      assetKey: "reminder",
      color: "#D97706",
      bg: "#FFFBEB",
    });
  }
  if (
    haystack.includes("event") ||
    haystack.includes("notice") ||
    haystack.includes("alert") ||
    haystack.includes("reminder") ||
    haystack.includes("maintenance") ||
    haystack.includes("seat available") ||
    haystack.includes("waiting list")
  ) {
    return buildVisual({
      ionicon: "megaphone-outline",
      assetKey: "reminder",
      color: "#D97706",
      bg: "#FFFBEB",
    });
  }
  if (
    haystack.includes("report") ||
    haystack.includes("warning") ||
    haystack.includes("declined") ||
    haystack.includes("not approved")
  ) {
    return buildVisual({
      ionicon: "warning-outline",
      assetKey: "reminder",
      color: "#DC2626",
      bg: "#FEF2F2",
    });
  }

  return null;
}

/** Resolve icon + colors for notification list rows and foreground banners. */
export function resolveNotificationVisual(input = {}) {
  const kind = String(input.kind ?? "").toLowerCase();
  const type = String(input.type ?? "").toLowerCase();
  const title = String(input.title ?? "").toLowerCase();
  const body = String(input.body ?? input.description ?? "").toLowerCase();
  const actionUrl = String(input.actionUrl ?? input.action_url ?? "").toLowerCase();
  const haystack = `${title} ${body}`;

  if (kind && KIND_VISUALS[kind]) {
    return buildVisual(KIND_VISUALS[kind]);
  }

  if (actionUrl.includes("/messages") || actionUrl.includes("conversation")) {
    return buildVisual(KIND_VISUALS.message);
  }
  if (actionUrl.includes("/notices")) {
    return buildVisual({
      ionicon: "megaphone-outline",
      assetKey: "reminder",
      color: "#D97706",
      bg: "#FFFBEB",
    });
  }
  if (actionUrl.includes("/community-feed") || actionUrl.includes("/feed")) {
    return buildVisual(KIND_VISUALS.post_comment);
  }
  if (actionUrl.includes("/marketplace") || actionUrl.includes("listing")) {
    return buildVisual({
      ionicon: "storefront-outline",
      assetKey: "reminder",
      color: "#14B8A6",
      bg: "#D1FAF5",
    });
  }

  const haystackVisual = matchHaystackVisual(haystack);
  if (haystackVisual) return haystackVisual;

  if (type === "message") return buildVisual(KIND_VISUALS.message);
  if (type === "warning") {
    return buildVisual({
      ionicon: "warning-outline",
      assetKey: "reminder",
      color: "#DC2626",
      bg: "#FEF2F2",
    });
  }
  if (type === "success") return buildVisual(KIND_VISUALS.membership_approval);

  return buildVisual(DEFAULT_VISUAL);
}

export function getNotificationIconSource(input = {}) {
  return resolveNotificationVisual(input).iconSource ?? ICON_ASSETS.reminder;
}
