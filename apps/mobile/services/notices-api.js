import { apiRequest, ApiError } from "./api-client";
import { getToken } from "./auth-session";
import { API_BASE_URL } from "../constants/api-config";
import { extractStoragePath, resolveMediaUrl } from "../utils/profile-display";
import { guessImageMeta, uploadMultipartFile } from "../utils/upload-form-data";
import { toApiDate } from "../utils/form-datetime";
import { HOME_SECTION_CARD_LIMIT } from "../constants/home-sections";
import {
  isNoticeExpiredForHome,
  isCarouselNotice,
} from "../utils/notice-home-expiry";

export { isNoticeExpiredForHome, isCarouselNotice };

export const NOTICE_CATEGORIES = [
  { id: "all", label: "All", category: null, icon: "layers" },
  { id: "events", label: "Events", category: "event", icon: "calendar" },
  { id: "alerts", label: "Alerts", category: "emergency", icon: "alert-triangle" },
  { id: "maintenance", label: "Maintenance", category: "maintenance", icon: "tool" },
  { id: "security", label: "Security", category: "security", icon: "shield" },
  { id: "announcements", label: "General", category: "general", icon: "bell" },
];

/** Categories available on the create-notice form (excludes event & alert). */
export const NOTICE_FORM_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "maintenance", label: "Maintenance" },
  { value: "security", label: "Security" },
  { value: "finance", label: "Finance" },
];

export const CATEGORY_THEME = {
  event: {
    label: "Event",
    bg: "#FFF7ED",
    text: "#C2410C",
    accent: "#F97316",
    icon: "calendar",
  },
  emergency: {
    label: "Alert",
    bg: "#FEF2F2",
    text: "#B91C1C",
    accent: "#EF4444",
    icon: "alert-triangle",
  },
  maintenance: {
    label: "Maintenance",
    bg: "#FFFBEB",
    text: "#B45309",
    accent: "#F59E0B",
    icon: "tool",
  },
  security: {
    label: "Security",
    bg: "#F5F3FF",
    text: "#6D28D9",
    accent: "#8B5CF6",
    icon: "shield",
  },
  finance: {
    label: "Finance",
    bg: "#ECFDF5",
    text: "#047857",
    accent: "#10B981",
    icon: "dollar-sign",
  },
  general: {
    label: "Announcement",
    bg: "#EFF6FF",
    text: "#1D4ED8",
    accent: "#3B82F6",
    icon: "bell",
  },
};

const DEFAULT_THEME = CATEGORY_THEME.general;

function resolveNoticeImageUrl(path) {
  const resolved = resolveMediaUrl(path);
  if (!resolved) return null;
  const trimmed = String(resolved).trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
  return trimmed;
}

export function getCategoryTheme(category) {
  return CATEGORY_THEME[category] ?? DEFAULT_THEME;
}

export function formatNoticeDate(dateStr) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateStr;
  }
}

export function formatEventTimeRange(raw) {
  const from = formatDisplayTime12h(raw?.event_time ?? raw?.eventTime);
  const to = formatDisplayTime12h(raw?.event_time_end ?? raw?.eventTimeEnd);
  if (from && to) return `${from} – ${to}`;
  return from || to || "";
}

export function formatEventSchedule(notice) {
  if (!notice?.event_date && !notice?.event_time && !notice?.event_time_end) return null;

  const parts = [];
  if (notice.event_date) {
    try {
      parts.push(
        new Date(notice.event_date).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
      );
    } catch {
      parts.push(notice.event_date);
    }
  }
  const timeRange = formatEventTimeRange(notice);
  if (timeRange) parts.push(timeRange);
  return parts.join(" · ");
}

/** True when admin set an event/notice schedule (not publish time). */
export function hasNoticeSchedule(notice) {
  if (!notice) return false;
  const date = notice.eventDate ?? notice.event_date;
  const time = notice.eventTime ?? notice.event_time;
  const timeEnd = notice.eventTimeEnd ?? notice.event_time_end;
  return Boolean(String(date ?? "").trim() || String(time ?? "").trim() || String(timeEnd ?? "").trim());
}

/** Parse YYYY-MM-DD (or ISO) as local noon to avoid timezone drift. */
export function parseNoticeDay(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  } catch {
    return null;
  }
}

export function isEventNotice(notice) {
  const category = String(notice?.category ?? "").trim().toLowerCase();
  return category === "event" || notice?.isEvent === true;
}

export function isAlertNotice(notice) {
  const category = String(notice?.category ?? "").trim().toLowerCase();
  return category === "emergency" || notice?.isAlert === true;
}

/** Route events to event detail; other notices to notice detail. */
export function getNoticeDetailRoute(notice) {
  const id = String(notice?.id ?? "");
  if (isEventNotice(notice)) {
    return { pathname: "/screens/event-detail", params: { id } };
  }
  return { pathname: "/screens/notice-detail", params: { id } };
}

/** Normalize expo-router params that may arrive as string or string[]. */
export function resolveNoticeId(id) {
  const raw = Array.isArray(id) ? id[0] : id;
  const parsed = String(raw ?? "").trim();
  return parsed.length > 0 ? parsed : null;
}

export function normalizeNotice(raw) {
  if (!raw) return null;
  const theme = getCategoryTheme(raw.category);

  return {
    id: raw.id,
    title: raw.title ?? "",
    body: raw.body ?? raw.description ?? "",
    category: raw.category ?? "general",
    categoryLabel: theme.label,
    location: raw.location ?? null,
    imageUrl: resolveNoticeImageUrl(raw.image_url),
    eventDate: raw.event_date ?? null,
    eventTime: raw.event_time ?? null,
    eventTimeEnd: raw.event_time_end ?? null,
    eventSchedule: formatEventSchedule(raw),
    status: raw.status ?? "published",
    publishedAt: raw.published_at ?? raw.created_at,
    createdAt: raw.created_at,
    authorName: raw.author_name ?? "Community Admin",
    authorAvatar: resolveMediaUrl(raw.author_avatar) ?? null,
    authorId: raw.author_id ?? null,
    rsvpCount: raw.rsvp_count ?? 0,
    waitlistCount: raw.waitlist_count ?? 0,
    eventCapacity: raw.event_capacity ?? null,
    spotsRemaining: raw.spots_remaining ?? null,
    isFull: Boolean(raw.is_full),
    attendees: (raw.attendees ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? "Neighbor",
      avatarUrl: resolveMediaUrl(row.avatar_url) ?? null,
    })),
    waitlist: (raw.waitlist ?? []).map((row) => ({
      id: row.id,
      name: row.name ?? "Neighbor",
      avatarUrl: resolveMediaUrl(row.avatar_url) ?? null,
      joinedAt: row.joined_at ?? null,
      position: row.position ?? null,
    })),
    isJoined: Boolean(raw.is_joined),
    isWaitlisted: Boolean(raw.is_waitlisted),
    waitlistPosition: raw.waitlist_position ?? null,
    isOrganizer: Boolean(raw.is_organizer),
    isPinned: Boolean(raw.is_pinned_active ?? raw.is_pinned),
    requiresRsvp: Boolean(raw.requires_rsvp),
    scheduledAt: raw.scheduled_at ?? null,
    timeLabel: formatNoticeDate(raw.published_at ?? raw.created_at),
    theme,
    isEvent: isEventNotice({ category: raw.category }),
    isAlert: isAlertNotice({ category: raw.category }),
  };
}

export function sortNotices(notices) {
  return [...notices].sort((a, b) => {
    const aPin = a.isPinned ? 1 : 0;
    const bPin = b.isPinned ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;

    const aEvent = a.isEvent && a.eventDate ? new Date(a.eventDate).getTime() : null;
    const bEvent = b.isEvent && b.eventDate ? new Date(b.eventDate).getTime() : null;

    if (aEvent && bEvent && aEvent !== bEvent) return aEvent - bEvent;
    if (aEvent && !bEvent) return -1;
    if (!aEvent && bEvent) return 1;

    const aTime = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime();
    return bTime - aTime;
  });
}

/** Short label for home carousel, e.g. "May 23" */
export function formatShortDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

/** Long label for event cards, e.g. "May 26, 2024" */
export function formatLongDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

/** Compact RSVP label for event cards in lists and carousels. */
export function formatEventRsvpLabel(notice) {
  const count = notice?.rsvpCount ?? 0;
  const capacity = notice?.eventCapacity;
  const waiting = notice?.waitlistCount ?? 0;
  const waitingSuffix = waiting > 0 ? ` · ${waiting} waiting` : "";

  if (capacity != null && capacity > 0) {
    const base = `${count} / ${capacity} going`;
    return notice?.isFull ? `${base} · Full${waitingSuffix}` : `${base}${waitingSuffix}`;
  }

  if (count <= 0 && waiting <= 0) return null;
  if (count <= 0) return `${waiting} waiting`;
  if (count === 1) return `1 going${waitingSuffix}`;
  return `${count} going${waitingSuffix}`;
}

/** "09:00:00" or "09:00" → "9:00 AM" */
export function formatDisplayTime12h(timeStr) {
  if (!timeStr) return "";
  const parts = String(timeStr).trim().split(":");
  if (parts.length < 2) return timeStr;
  let hour = Number(parts[0]);
  const minute = parts[1].slice(0, 2);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

/** Latest published notices for the home hero carousel (excludes events, alerts, and past events). */
export function pickNeighborhoodCarousel(notices, limit = HOME_SECTION_CARD_LIMIT) {
  return [...notices]
    .filter(isCarouselNotice)
    .filter((n) => !isNoticeExpiredForHome(n))
    .sort((a, b) => {
      const aPin = a.isPinned ? 1 : 0;
      const bPin = b.isPinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;

      const aTime = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime();
      const bTime = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

/** Home "Happening Soon" — upcoming events sorted by date (past dates hidden). */
export function pickUpcomingEvents(notices, limit = HOME_SECTION_CARD_LIMIT) {
  return notices
    .filter((n) => n.isEvent)
    .filter((n) => !isNoticeExpiredForHome(n))
    .sort((a, b) => {
      const aPin = a.isPinned ? 1 : 0;
      const bPin = b.isPinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;

      const aT = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
      const bT = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
      return aT - bT;
    })
    .slice(0, limit);
}

export async function fetchNotices({ category, categoryGroup, search, perPage = 50 } = {}) {
  const params = new URLSearchParams();
  if (categoryGroup) params.set("category_group", categoryGroup);
  if (category) params.set("category", category);
  if (search?.trim()) params.set("search", search.trim());
  params.set("per_page", String(perPage));
  const qs = params.toString() ? `?${params}` : "";

  try {
    const res = await apiRequest(`/notices${qs}`);
    const items = (res.data ?? []).map(normalizeNotice).filter(Boolean);
    return {
      notices: sortNotices(items),
      meta: res.meta ?? {},
    };
  } catch (err) {
    if (err?.status === 422) {
      return { notices: [], meta: { reason: "no_approved_membership" } };
    }
    throw err;
  }
}

export async function fetchNotice(id) {
  const noticeId = resolveNoticeId(id);
  if (!noticeId) {
    throw new ApiError("Notice not found.", { status: 404, code: "NOTICE_NOT_FOUND" });
  }

  const res = await apiRequest(`/notices/${noticeId}`);
  const notice = normalizeNotice(res?.data);
  if (!notice) {
    throw new ApiError("Notice not found.", { status: 404, code: "NOTICE_NOT_FOUND" });
  }
  return notice;
}

export async function joinEvent(noticeId) {
  const id = resolveNoticeId(noticeId);
  if (!id) {
    throw new ApiError("Event not found.", { status: 404, code: "NOTICE_NOT_FOUND" });
  }

  const res = await apiRequest(`/notices/${id}/rsvp`, {
    method: "POST",
    body: { status: "going" },
  });

  const event = normalizeNotice(res?.data);
  if (!event) {
    throw new ApiError("Could not join this event. Please try again.", {
      status: 500,
      code: "RSVP_INVALID_RESPONSE",
    });
  }

  return { event, message: res?.message ?? "You joined this event" };
}

export async function leaveEvent(noticeId) {
  const id = resolveNoticeId(noticeId);
  if (!id) {
    throw new ApiError("Event not found.", { status: 404, code: "NOTICE_NOT_FOUND" });
  }

  const res = await apiRequest(`/notices/${id}/rsvp`, {
    method: "POST",
    body: { status: "not_going" },
  });

  const event = normalizeNotice(res?.data);
  if (!event) {
    throw new ApiError("Could not update your RSVP. Please try again.", {
      status: 500,
      code: "RSVP_INVALID_RESPONSE",
    });
  }

  return { event, message: res?.message ?? "You left this event" };
}

export async function uploadNoticeImage(uri, assetMeta = {}) {
  const token = await getToken();
  if (!token) {
    throw new Error("You must be signed in to upload an image.");
  }

  const { mimeType } = guessImageMeta(uri, assetMeta, "notice-cover");

  const body = await uploadMultipartFile({
    url: `${API_BASE_URL}/admin/notices/upload-image`,
    uri,
    fieldName: "image",
    token,
    mimeType,
  });

  const imageUrl = resolveMediaUrl(body?.data?.image_url);
  if (!imageUrl) {
    throw new Error("Image upload failed. Please try again.");
  }

  return { image_url: imageUrl };
}

export async function uploadResidentEventImage(uri, assetMeta = {}) {
  const token = await getToken();
  if (!token) {
    throw new Error("You must be signed in to upload an image.");
  }

  const { mimeType } = guessImageMeta(uri, assetMeta, "event-cover");

  const body = await uploadMultipartFile({
    url: `${API_BASE_URL}/events/upload-image`,
    uri,
    fieldName: "image",
    token,
    mimeType,
  });

  const imageUrl = resolveMediaUrl(body?.data?.image_url);
  if (!imageUrl) {
    throw new Error("Image upload failed. Please try again.");
  }

  return { image_url: imageUrl };
}

/** Upload optional cover image, then call a create helper. */
export async function publishNoticeWithImage(
  coverImage,
  createFn,
  payload,
  { uploadImage = uploadNoticeImage } = {},
) {
  let image_url;
  if (coverImage?.uri) {
    const uploaded = await uploadImage(coverImage.uri, coverImage);
    image_url = extractStoragePath(uploaded.image_url) ?? uploaded.image_url;
  }
  return createFn({ ...payload, image_url });
}

export async function createNotice({
  title,
  body,
  category = "general",
  location,
  image_url,
  event_date,
  event_time,
  event_time_end,
  status = "published",
  is_pinned,
  scheduled_at,
  audience_type,
  recipient_user_ids,
}) {
  const res = await apiRequest("/admin/notices", {
    method: "POST",
    body: {
      title,
      body,
      category,
      location,
      image_url,
      event_date,
      event_time,
      event_time_end,
      status,
      is_pinned,
      scheduled_at,
      audience_type,
      recipient_user_ids,
    },
  });
  return { notice: normalizeNotice(res.data), message: res.message };
}

export async function createEvent({
  title,
  body,
  location,
  image_url,
  event_date,
  event_time,
  event_time_end,
  event_capacity,
  requires_rsvp,
  is_pinned,
  scheduled_at,
}) {
  const res = await apiRequest("/admin/events", {
    method: "POST",
    body: {
      title,
      body,
      location,
      image_url,
      event_date,
      event_time,
      event_time_end,
      event_capacity,
      requires_rsvp,
      is_pinned,
      scheduled_at,
    },
  });
  return { notice: normalizeNotice(res.data), message: res.message };
}

/** Resident submits an event for community admin approval. */
export async function submitResidentEvent({
  title,
  body,
  location,
  image_url,
  event_date,
  event_time,
  event_time_end,
  event_capacity,
  requires_rsvp,
}) {
  const res = await apiRequest("/events", {
    method: "POST",
    body: {
      title,
      body,
      location,
      image_url,
      event_date,
      event_time,
      event_time_end,
      event_capacity,
      requires_rsvp,
    },
  });
  return { notice: normalizeNotice(res.data), message: res.message };
}

export async function createAlert({
  title,
  body,
  location,
  image_url,
  event_date,
  event_time,
  event_time_end,
  is_pinned,
  scheduled_at,
}) {
  const res = await apiRequest("/admin/alerts", {
    method: "POST",
    body: {
      title,
      body,
      location,
      image_url,
      event_date,
      event_time,
      event_time_end,
      is_pinned,
      scheduled_at,
    },
  });
  return { notice: normalizeNotice(res.data), message: res.message };
}

export async function updateNotice(id, payload) {
  const res = await apiRequest(`/admin/notices/${id}`, {
    method: "PATCH",
    body: payload,
  });
  return normalizeNotice(res.data);
}

export async function deleteNotice(id) {
  await apiRequest(`/admin/notices/${id}`, { method: "DELETE" });
}

export async function fetchAdminNotices({
  review_status = "pending",
  category_group,
  page = 1,
  per_page = 50,
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(per_page),
  });
  if (review_status && review_status !== "all") params.set("review_status", review_status);
  if (category_group) params.set("category_group", category_group);
  const res = await apiRequest(`/admin/notices?${params}`);
  return {
    data: (res.data ?? []).map(normalizeNotice),
    meta: res.meta ?? {},
  };
}

export async function approveNotice(id) {
  const res = await apiRequest(`/admin/notices/${id}/approve`, { method: "PATCH" });
  return normalizeNotice(res.data);
}

export async function rejectNotice(id, reason) {
  const res = await apiRequest(`/admin/notices/${id}/reject`, {
    method: "PATCH",
    body: reason ? { reason: String(reason).trim() } : {},
  });
  return normalizeNotice(res.data);
}
