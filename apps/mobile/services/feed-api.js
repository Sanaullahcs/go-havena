import { apiRequest } from "./api-client";
import { extractStoragePath, resolveMediaUrl } from "../utils/profile-display";
import { ensureFeedCommunityContext } from "./feed-context";
import { API_BASE_URL } from "../constants/api-config";
import { getCommunityId, getToken } from "./auth-session";
import { guessImageMeta, uploadMultipartFile } from "../utils/upload-form-data";
import { HOME_SECTION_CARD_LIMIT } from "../constants/home-sections";
import i18n, { localizedField } from "../i18n";
import { getLocaleForLang } from "../hooks/use-app-locale";

export const FEED_TOPICS = [
  "Recommendations",
  "Events",
  "Help",
  "Neighborhood",
  "Announcements",
];

const TOPIC_TO_CATEGORY = {
  Recommendations: "general",
  Events: "event",
  Help: "help",
  Neighborhood: "update",
  Announcements: "announcement",
};

export const POST_TYPE_THEMES = {
  Recommendations: { bg: "#F3E8FF", text: "#7C3AED", border: "#DDD6FE" },
  Events: { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" },
  Help: { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
  Neighborhood: { bg: "#D1FAF5", text: "#1B4F8A", border: "rgba(20, 184, 166, 0.28)" },
  Announcements: { bg: "#FEF3C7", text: "#B45309", border: "#FDE68A" },
};

export const TOPIC_LABEL_KEY = {
  Recommendations: "feed.topics.recommendations",
  Events: "feed.topics.events",
  Help: "feed.topics.help",
  Neighborhood: "feed.topics.neighborhood",
  Announcements: "feed.topics.announcements",
  Poll: "feed.topics.poll",
};

/** Post type options for create-post (labelKey + API category + chip colors). */
export const POST_TYPE_OPTIONS = FEED_TOPICS.map((label) => ({
  label,
  labelKey: TOPIC_LABEL_KEY[label] ?? label,
  category: TOPIC_TO_CATEGORY[label],
  ...(POST_TYPE_THEMES[label] ?? {
    bg: "#F3F4F6",
    text: "#4B5563",
    border: "#E5E7EB",
  }),
}));

/**
 * Parse Laravel/MySQL datetime strings reliably across iOS & Android.
 * API timestamps are UTC (APP_TIMEZONE=UTC). Naive values are treated as UTC;
 * strings with Z / ±offset use the native ISO parser.
 */
export function parseApiDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  }

  const str = String(dateStr).trim();
  if (!str) return null;

  // Explicit timezone (e.g. 2026-07-23T13:39:25+00:00 or ...Z) — do not strip the offset.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(str)) {
    const withZone = new Date(str);
    if (!Number.isNaN(withZone.getTime())) return withZone;
  }

  // Naive MySQL/Laravel datetime → UTC (matches backend APP_TIMEZONE=UTC).
  const mysqlMatch = str.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/,
  );

  if (mysqlMatch) {
    const [, y, mo, d, h, mi, s = "0"] = mysqlMatch;
    const utc = new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    );
    if (!Number.isNaN(utc.getTime())) return utc;
  }

  const iso = str.includes("T") ? str : str.replace(" ", "T");
  const parsed = new Date(iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function timeAgo(dateStr, now = Date.now()) {
  const date = parseApiDate(dateStr);
  if (!date) return "";

  let diff = Math.floor((now - date.getTime()) / 1000);
  if (!Number.isFinite(diff) || diff < 0) return i18n.t("time.justNow");
  if (diff < 60) return i18n.t("time.justNow");
  if (diff < 3600) return i18n.t("time.minutesShort", { count: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t("time.hoursShort", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return i18n.t("time.daysShort", { count: Math.floor(diff / 86400) });

  return date.toLocaleDateString(getLocaleForLang(i18n.language), { month: "short", day: "numeric" });
}

/** Live relative time for comments / messages. */
export function formatCommentTime(dateStr, { optimistic = false, now = Date.now() } = {}) {
  if (optimistic) return i18n.t("time.justNow");

  const date = parseApiDate(dateStr);
  if (!date) return "";

  const locale = getLocaleForLang(i18n.language);
  let diff = Math.floor((now - date.getTime()) / 1000);
  if (!Number.isFinite(diff) || diff < 0) return i18n.t("time.justNow");
  if (diff < 60) return i18n.t("time.justNow");
  if (diff < 3600) return i18n.t("time.minutesShort", { count: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t("time.hoursShort", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return i18n.t("time.daysShort", { count: Math.floor(diff / 86400) });

  const day = date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const clock = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${clock}`;
}

/** Resolve label for a comment row — pending posts show localized "just now". */
export function getCommentTimeLabel(comment, now = Date.now()) {
  if (!comment) return "";
  if (comment.pending) return i18n.t("time.justNow");
  return formatCommentTime(comment.created_at, { now }) || comment.time_ago || "";
}

export function formatCount(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

export function formatEngagementSummary(likesCount, commentsCount) {
  const likes = Number(likesCount ?? 0);
  const comments = Number(commentsCount ?? 0);
  const parts = [];

  if (likes > 0) {
    parts.push(`${formatCount(likes)} ${i18n.t("feed.likeCount", { count: likes })}`);
  }
  if (comments > 0) {
    parts.push(`${formatCount(comments)} ${i18n.t("feed.commentCount", { count: comments })}`);
  }

  return parts.join(" · ");
}

export function isSensitivePost(post) {
  if (!post) return false;
  const flag = post.is_sensitive;
  return flag === true || flag === 1 || flag === "1";
}

function getSensitivePostMessage() {
  return i18n.t("feed.sensitiveContent.defaultMessage");
}

function pushUniqueImageUrl(urls, value) {
  const raw = typeof value === "string" ? value : value?.url ?? value?.image_url ?? value?.uri ?? "";
  const uri = resolveMediaUrl(raw) ?? String(raw ?? "").trim();
  if (!uri || uri === "null" || uri === "undefined" || urls.includes(uri)) return;
  urls.push(uri);
}

/** All viewable image URLs on a feed post (single image_url plus any gallery arrays). */
export function getPostImageUrls(post) {
  if (!post || isSensitivePost(post)) return [];
  const urls = [];
  pushUniqueImageUrl(urls, post.image_url);
  const extras = post.images ?? post.image_urls ?? post.media;
  if (Array.isArray(extras)) {
    extras.forEach((item) => pushUniqueImageUrl(urls, item));
  }
  return urls;
}

export function normalizePost(raw) {
  if (!raw) return null;

  const authorName = raw.author_name ?? raw.user?.display_name ?? raw.user?.name ?? i18n.t("feed.neighbor");
  const avatarUrl = resolveMediaUrl(raw.author_avatar ?? raw.user?.avatar);
  const sensitive = isSensitivePost(raw);
  const text = sensitive ? "" : (raw.body ?? raw.content ?? "");
  const imageUrl = sensitive ? null : (resolveMediaUrl(raw.image_url) ?? raw.image_url);
  const images = sensitive ? [] : getPostImageUrls({ ...raw, image_url: imageUrl });

  return {
    ...raw,
    id: raw.id,
    content: text,
    body: text,
    image_url: imageUrl || images[0] || null,
    images,
    tag: raw.tag ?? null,
    likes_count: raw.likes_count ?? raw.likes ?? 0,
    comments_count: raw.comments_count ?? raw.comments ?? 0,
    likes: raw.likes_count ?? raw.likes ?? 0,
    comments: raw.comments_count ?? raw.comments ?? 0,
    liked_by_me: raw.liked_by_me ?? false,
    is_mine: raw.is_mine ?? false,
    author_role: raw.author_role ?? raw.user?.role ?? null,
    can_block: raw.can_block,
    status: raw.status ?? "approved",
    is_sensitive: sensitive,
    sensitive_message: sensitive
      ? (raw.sensitive_message || getSensitivePostMessage())
      : null,
    user: {
      id: raw.user_id ?? raw.user?.id ?? null,
      name: authorName,
      display_name: authorName,
      role: raw.author_role ?? raw.user?.role ?? null,
      avatar: avatarUrl,
      time: timeAgo(raw.created_at),
      location: raw.author_unit ? i18n.t("marketplace.unitLabel", { unit: raw.author_unit }) : raw.user?.location ?? "",
    },
  };
}

/** Latest community posts for the home feed carousel. */
export function pickHomeFeedPosts(posts, limit = HOME_SECTION_CARD_LIMIT) {
  return [...(posts ?? [])]
    .sort((a, b) => {
      const aTime = new Date(a.created_at ?? 0).getTime();
      const bTime = new Date(b.created_at ?? 0).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

/** Keep the previous array when a silent refresh returned the same visible posts. */
export function areFeedPostsUnchanged(prev, next) {
  if (prev === next) return true;
  if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length) return false;
  return prev.every((post, index) => {
    const other = next[index];
    return (
      post.id === other.id
      && post.image_url === other.image_url
      && post.content === other.content
      && post.likes_count === other.likes_count
      && post.comments_count === other.comments_count
      && post.liked_by_me === other.liked_by_me
      && post.status === other.status
    );
  });
}

export function normalizeComment(raw) {
  if (!raw) return null;

  const authorName = raw.author_name ?? raw.user?.display_name ?? raw.user?.name ?? i18n.t("feed.neighbor");
  const parentId = raw.parent_id != null ? Number(raw.parent_id) : null;

  return {
    ...raw,
    id: raw.id,
    parent_id: Number.isFinite(parentId) && parentId > 0 ? parentId : null,
    depth: Math.max(0, Math.min(Number(raw.depth) || 0, 2)),
    parent_author_name: raw.parent_author_name ?? null,
    content: raw.content ?? raw.body ?? "",
    body: raw.body ?? raw.content ?? "",
    created_at: raw.created_at,
    time_ago: formatCommentTime(raw.created_at),
    is_mine: raw.is_mine ?? false,
    liked_by_me: raw.liked_by_me ?? false,
    likes_count: Number(raw.likes_count ?? 0),
    user: {
      id: raw.user_id ?? raw.user?.id ?? null,
      name: authorName,
      display_name: authorName,
      avatar: resolveMediaUrl(raw.author_avatar ?? raw.user?.avatar),
    },
  };
}

/** Flatten-ready list: API already returns thread order; ensure depth is set. */
export function orderCommentsForThread(comments = []) {
  return (comments ?? [])
    .map(normalizeComment)
    .filter(Boolean)
    .map((comment) => ({
      ...comment,
      depth: Math.max(0, Math.min(Number(comment.depth) || 0, 2)),
    }));
}

export function topicToCategory(topic) {
  return TOPIC_TO_CATEGORY[topic] ?? null;
}

const CATEGORY_TO_TOPIC = {
  general: "Recommendations",
  event: "Events",
  help: "Help",
  update: "Neighborhood",
  announcement: "Announcements",
};

export function categoryToTopic(category) {
  return CATEGORY_TO_TOPIC[category] ?? null;
}

const PHOTO_ONLY_BODY = /^shared a photo\.?$/i;

/** Split stored post body into display text, feeling, and location metadata. */
export function parsePostDisplayContent(post) {
  const locBody = localizedField(post, "body");
  const raw = String(locBody || (post?.content ?? post?.body ?? "")).trim();
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);

  const mainLines = [];
  let feeling = null;
  let location = null;

  for (const line of lines) {
    const feelingMatch = line.match(/^— feeling (\S+)\s+(.+)$/);
    const locationMatch = line.match(/^📍\s*(.+)$/);

    if (feelingMatch) {
      feeling = { emoji: feelingMatch[1], label: feelingMatch[2] };
    } else if (locationMatch) {
      location = locationMatch[1];
    } else if (!PHOTO_ONLY_BODY.test(line)) {
      mainLines.push(line);
    }
  }

  const mainText = mainLines.join("\n").trim();
  const hasImage = Boolean(post?.image_url);

  return {
    mainText: mainText || null,
    feeling,
    location,
    hasImage,
    isPhotoOnly: hasImage && !mainText && !feeling && !location,
  };
}

/** Plain-text preview used when sending a post to a neighbor in Messages. */
export function formatPostShareMessage(post, t) {
  const author = post?.user?.display_name ?? post?.user?.name ?? t("feed.neighbor");
  const display = parsePostDisplayContent(post);
  const text = display.mainText || "";
  const preview = text.length > 280 ? `${text.slice(0, 280)}…` : text;
  const header = t("feed.postBy", { name: author });
  if (preview) return `${header}\n\n${preview}`;
  if (display.hasImage) return `${header}\n\n${t("feed.shareMessage")}`;
  return t("feed.shareMessage");
}

/** Restore create-post form fields from a stored post body. */
export function parsePostBodyForEdit(rawBody) {
  const parsed = parsePostDisplayContent({ content: rawBody, body: rawBody });
  return {
    text: parsed.mainText ?? "",
    feeling: parsed.feeling,
    location: parsed.location,
  };
}

export async function fetchFeedTopics() {
  const res = await apiRequest("/feed/topics");
  return res.data ?? [];
}

export async function fetchFeed({ page = 1, perPage = 10, q, category, topic, mine = false } = {}) {
  const communityId = await ensureFeedCommunityContext();

  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });

  if (communityId) {
    params.set("community_id", String(communityId));
  }
  if (q) params.set("q", q);
  if (mine) params.set("mine", "1");
  const resolvedCategory = category ?? (topic ? topicToCategory(topic) : null);
  if (resolvedCategory) params.set("category", resolvedCategory);

  const res = await apiRequest(`/feed?${params}`);
  const posts = (res.data ?? []).map(normalizePost).filter(Boolean);
  const meta = res.meta ?? {};

  return {
    posts,
    meta,
    communityId: meta.community_id ?? communityId ?? null,
    emptyReason: meta.reason ?? (posts.length === 0 ? "no_posts" : null),
  };
}

export async function fetchMyPosts({ page = 1, perPage = 20 } = {}) {
  return fetchFeed({ page, perPage, mine: true });
}

export async function fetchPost(postId) {
  const res = await apiRequest(`/feed/${postId}`);
  return normalizePost(res.data);
}

export async function searchFeed({ q = "", topic } = {}) {
  return fetchFeed({ q, topic, perPage: 20 });
}

export async function uploadPostImage(uri, assetMeta = {}) {
  await ensureFeedCommunityContext();

  const token = await getToken();
  if (!token) {
    throw new Error(i18n.t("imagePicker.signInRequired"));
  }

  const communityId = await getCommunityId();
  const { mimeType } = guessImageMeta(uri, assetMeta, "post-image");

  const body = await uploadMultipartFile({
    url: `${API_BASE_URL}/feed/upload-image`,
    uri,
    fieldName: "image",
    token,
    mimeType,
    headers: communityId ? { "X-Community-Id": String(communityId) } : {},
  });

  const imageUrl = resolveMediaUrl(body?.data?.image_url);
  if (!imageUrl) {
    throw new Error(i18n.t("imagePicker.uploadFailed"));
  }

  return { image_url: imageUrl };
}

export async function createPost({ content, category = "general", imageUrl, poll } = {}) {
  await ensureFeedCommunityContext();

  const body = poll
    ? { category: "poll", poll }
    : { body: content, category };
  if (!poll && imageUrl) {
    body.image_url = extractStoragePath(imageUrl) ?? imageUrl;
  }

  const res = await apiRequest("/feed", {
    method: "POST",
    body,
  });

  return {
    post: normalizePost(res.data),
    message: res.message ?? i18n.t("feed.postPublished"),
  };
}

export async function deletePost(postId) {
  await apiRequest(`/feed/${postId}`, { method: "DELETE" });
}

export async function updatePost(
  postId,
  { content, category, imageUrl, removeImage = false } = {},
) {
  await ensureFeedCommunityContext();

  const body = {};
  if (content !== undefined) body.body = content;
  if (category) body.category = category;
  if (removeImage) {
    body.remove_image = true;
  } else if (imageUrl) {
    body.image_url = extractStoragePath(imageUrl) ?? imageUrl;
  }

  const res = await apiRequest(`/feed/${postId}`, {
    method: "PUT",
    body,
  });

  return {
    post: normalizePost(res.data),
    message: res.message ?? i18n.t("feed.postUpdated"),
  };
}

export async function voteOnPoll(postId, optionId) {
  await ensureFeedCommunityContext();
  const res = await apiRequest(`/feed/${postId}/vote`, {
    method: "POST",
    body: { option_id: optionId },
  });
  return normalizePost(res.data);
}

export function pollTimeLeftLabel(endsAt, closed, t, now = Date.now()) {
  if (closed) return t("feed.poll.closed");
  const end = parseApiDate(endsAt);
  if (!end) return "";
  const diff = end.getTime() - now;
  if (diff <= 0) return t("feed.poll.closed");
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("feed.poll.momentsLeft");
  if (minutes < 60) return t("feed.poll.minutesLeft", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("feed.poll.hoursLeft", { count: hours });
  return t("feed.poll.daysLeft", { count: Math.floor(hours / 24) });
}

export async function likePost(postId) {
  await ensureFeedCommunityContext();
  const res = await apiRequest(`/feed/${postId}/like`, { method: "POST" });
  return {
    liked: res.liked ?? false,
    likes_count: res.likes_count ?? 0,
  };
}

/** POST /v1/feed/{id}/report — resident reports a post for admin review. */
export async function reportFeedPost(postId, { type = "other", description } = {}) {
  await ensureFeedCommunityContext();
  const res = await apiRequest(`/feed/${postId}/report`, {
    method: "POST",
    body: {
      type,
      description,
      reason: description,
    },
  });

  return {
    message: res?.message ?? "Report submitted. Community admins will review this post.",
    data: res?.data ?? null,
  };
}

/** POST /v1/feed/{postId}/comments/{commentId}/report — resident reports a comment. */
export async function reportFeedComment(postId, commentId, { type = "other", description } = {}) {
  await ensureFeedCommunityContext();
  const res = await apiRequest(`/feed/${postId}/comments/${commentId}/report`, {
    method: "POST",
    body: {
      type,
      description,
      reason: description,
    },
  });

  return {
    message: res?.message ?? "Report submitted. Community admins will review this comment.",
    data: res?.data ?? null,
  };
}

export async function fetchComments(postId) {
  const res = await apiRequest(`/feed/${postId}/comments`);
  return orderCommentsForThread(res.data ?? []);
}

export async function addComment(postId, content, parentId = null) {
  await ensureFeedCommunityContext();
  const body = { body: content };
  if (parentId != null) body.parent_id = Number(parentId);

  const res = await apiRequest(`/feed/${postId}/comments`, {
    method: "POST",
    body,
  });

  return {
    comment: normalizeComment(res.data),
    comments_count: res.comments_count ?? null,
  };
}

export async function toggleCommentLike(postId, commentId) {
  await ensureFeedCommunityContext();
  const res = await apiRequest(`/feed/${postId}/comments/${commentId}/like`, {
    method: "POST",
  });

  return {
    liked: res.liked ?? false,
    likes_count: res.likes_count ?? 0,
    message: res.message ?? "Comment updated",
  };
}

export async function deleteComment(postId, commentId) {
  await apiRequest(`/feed/${postId}/comments/${commentId}`, {
    method: "DELETE",
  });
}

export function applyLikeToPost(post, result) {
  if (!post) return post;
  return {
    ...post,
    liked_by_me: result.liked,
    likes_count: result.likes_count,
    likes: result.likes_count,
  };
}
