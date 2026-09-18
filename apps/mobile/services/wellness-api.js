import { apiRequest } from "./api-client";
import { resolveMediaUrl } from "../utils/profile-display";

function rawImageCandidate(value) {
  if (value && typeof value === "object") {
    return rawImageCandidate(value.url ?? value.image_url ?? value.uri ?? "");
  }
  const uri = String(value ?? "").trim();
  if (!uri || uri === "null" || uri === "undefined") return "";
  return uri;
}

function mapImageUrl(...candidates) {
  for (const value of candidates) {
    const raw = rawImageCandidate(value);
    if (!raw) continue;
    const resolved = resolveMediaUrl(raw);
    if (resolved) return resolved;
  }
  return null;
}

const WELLNESS_NO_CACHE = { cache: "no-store" };

let latestHub = null;
const hubListeners = new Set();

export function getCachedWellnessHub() {
  return latestHub;
}

export function clearWellnessHubCache() {
  latestHub = null;
}

export function subscribeWellnessHub(listener) {
  hubListeners.add(listener);
  return () => hubListeners.delete(listener);
}

function publishWellnessHub(hub) {
  latestHub = hub;
  hubListeners.forEach((listener) => {
    try {
      listener(hub);
    } catch (err) {
      console.warn("[wellness] hub listener failed", err);
    }
  });
}

export async function fetchWellnessHub() {
  const res = await apiRequest("/wellness/hub", WELLNESS_NO_CACHE);
  const hub = normalizeHub(res.data);
  publishWellnessHub(hub);
  return hub;
}

export async function fetchCategoryCourses(categoryKey) {
  const res = await apiRequest(
    `/wellness/categories/${encodeURIComponent(categoryKey)}/courses`,
    WELLNESS_NO_CACHE,
  );
  return {
    category: normalizeCategory(res.data?.category),
    courses: (res.data?.courses ?? []).map(normalizeCourseSummary),
  };
}

export async function fetchCourse(courseId) {
  const res = await apiRequest(`/wellness/courses/${courseId}`);
  return normalizeCourseDetail(res.data);
}

export async function fetchLesson(lessonId) {
  const res = await apiRequest(`/wellness/lessons/${lessonId}`);
  return normalizeLessonDetail(res.data);
}

const locallyCompletedLessonIds = new Set();

function rememberCompletedLesson(lessonId) {
  const id = Number(lessonId);
  if (Number.isFinite(id) && id > 0) locallyCompletedLessonIds.add(id);
}

function isLessonCompleted(raw) {
  const id = Number(raw?.id);
  if (Number.isFinite(id) && locallyCompletedLessonIds.has(id)) return true;
  const value = raw?.completed ?? raw?.is_completed ?? raw?.isCompleted;
  return value === true || value === 1 || value === "1" || value === "true";
}

export async function completeWellnessLesson(lessonId) {
  await apiRequest(`/wellness/lessons/${lessonId}/complete`, { method: "POST" });
  rememberCompletedLesson(lessonId);
}

export async function uncompleteWellnessLesson(lessonId) {
  await apiRequest(`/wellness/lessons/${lessonId}/complete`, { method: "DELETE" });
  locallyCompletedLessonIds.delete(Number(lessonId));
}

/** @deprecated legacy flat wellness list */
export async function fetchWellness() {
  return apiRequest("/wellness");
}

function normalizeHub(data) {
  const stats = data?.stats ?? {};
  return {
    stats: {
      totalCourses: stats.total_courses ?? 0,
      avgProgress: stats.avg_progress ?? 0,
      weekLabel: stats.week_label ?? "0m",
    },
    categories: (data?.categories ?? []).map(normalizeCategorySummary),
  };
}

function normalizeCategorySummary(c) {
  return {
    id: c.id,
    key: c.key,
    title: c.title,
    subtitle: c.subtitle ?? "",
    iconKey: c.icon_key ?? c.key,
    color: c.color ?? "#1B4F8A",
    imageUrl: mapImageUrl(c.image_url, c.imageUrl),
    courseCount: c.course_count ?? 0,
    coursesLabel: c.courses_label ?? "",
    progressPercent: c.progress_percent ?? 0,
    progressLabel: c.progress_label ?? "0% complete",
  };
}

function normalizeCategory(c) {
  if (!c) return null;
  return {
    id: c.id,
    key: c.key,
    title: c.title,
    subtitle: c.subtitle ?? "",
    iconKey: c.icon_key ?? c.key,
    color: c.color ?? "#1B4F8A",
    imageUrl: mapImageUrl(c.image_url, c.imageUrl),
  };
}

function normalizeCourseSummary(c) {
  return {
    id: c.id,
    title: c.title,
    description: c.description ?? "",
    imageUrl: mapImageUrl(c.image_url, c.imageUrl),
    lessonCount: c.lesson_count ?? 0,
    durationMin: c.duration_min ?? 0,
    lessonsLabel: c.lessons_label ?? "",
    progressPercent: c.progress_percent ?? 0,
    progressLabel: c.progress_label ?? "0% complete",
  };
}

function normalizeCourseDetail(c) {
  if (!c) return null;
  const lessons = (c.lessons ?? []).map((l, index, arr) => {
    const watchingIndex = arr.findIndex((item) => !isLessonCompleted(item));
    const completed = isLessonCompleted(l);
    return {
      id: Number(l.id),
      title: l.title,
      description: l.description ?? "",
      durationMin: l.duration_min ?? 0,
      timeLabel: l.time_label ?? `${l.duration_min ?? 0} min`,
      completed,
      isWatching: !completed && index === watchingIndex,
    };
  });

  return {
    id: c.id,
    categoryKey: c.category_key,
    categoryTitle: c.category_title,
    categoryColor: c.category_color ?? "#1B4F8A",
    categoryImageUrl: mapImageUrl(c.category_image_url, c.categoryImageUrl),
    title: c.title,
    description: c.description ?? "",
    imageUrl: mapImageUrl(c.image_url, c.imageUrl),
    lessons,
    completedCount: c.completed_count ?? 0,
    totalCount: c.total_count ?? lessons.length,
    progressPercent: c.progress_percent ?? 0,
  };
}

function normalizeLessonDetail(l) {
  if (!l) return null;
  const takeaways = Array.isArray(l.key_takeaways)
    ? l.key_takeaways.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const linkUrl = l.link_url || l.video_url || null;
  const fileUrl = resolveMediaUrl(l.file_url) || null;
  return {
    id: l.id,
    courseId: l.course_id,
    courseTitle: l.course_title,
    courseDescription: l.course_description ?? "",
    categoryKey: l.category_key,
    categoryTitle: l.category_title,
    categoryColor: l.category_color ?? "#1B4F8A",
    title: l.title,
    description: l.description ?? "",
    durationMin: l.duration_min ?? 0,
    videoUrl: linkUrl,
    linkUrl,
    fileUrl,
    thumbnailUrl: resolveMediaUrl(l.thumbnail_url || l.thumbnailUrl) || null,
    keyTakeaways: takeaways,
    completed: isLessonCompleted(l),
  };
}
