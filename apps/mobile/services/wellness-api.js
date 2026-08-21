import { apiRequest } from "./api-client";
import { resolveMediaUrl } from "../utils/profile-display";

export async function fetchWellnessHub() {
  const res = await apiRequest("/wellness/hub");
  return normalizeHub(res.data);
}

export async function fetchCategoryCourses(categoryKey) {
  const res = await apiRequest(`/wellness/categories/${encodeURIComponent(categoryKey)}/courses`);
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

export async function completeWellnessLesson(lessonId) {
  await apiRequest(`/wellness/lessons/${lessonId}/complete`, { method: "POST" });
}

export async function uncompleteWellnessLesson(lessonId) {
  await apiRequest(`/wellness/lessons/${lessonId}/complete`, { method: "DELETE" });
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
  };
}

function normalizeCourseSummary(c) {
  return {
    id: c.id,
    title: c.title,
    description: c.description ?? "",
    imageUrl: resolveMediaUrl(c.image_url),
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
    const watchingIndex = arr.findIndex((item) => !item.completed);
    return {
      id: l.id,
      title: l.title,
      description: l.description ?? "",
      durationMin: l.duration_min ?? 0,
      timeLabel: l.time_label ?? `${l.duration_min ?? 0} min`,
      completed: Boolean(l.completed),
      isWatching: !l.completed && index === watchingIndex,
    };
  });

  return {
    id: c.id,
    categoryKey: c.category_key,
    categoryTitle: c.category_title,
    categoryColor: c.category_color ?? "#1B4F8A",
    title: c.title,
    description: c.description ?? "",
    imageUrl: resolveMediaUrl(c.image_url),
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
    keyTakeaways: takeaways,
    completed: Boolean(l.completed),
  };
}
