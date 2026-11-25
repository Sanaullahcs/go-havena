import api from "./client";

export interface WellnessCategory {
  id: number;
  key: string;
  title: string;
  subtitle: string | null;
  icon_key: string | null;
  color: string;
  image_url: string | null;
  sort_order: number;
  status: "active" | "inactive";
  is_static?: boolean;
  course_count: number;
  lesson_count: number;
}

export interface WellnessCourse {
  id: number;
  category_id: number;
  category_key: string | null;
  category_title: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  status: "published" | "draft";
  lesson_count: number;
}

export interface WellnessLesson {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  duration_min: number;
  video_url: string | null;
  link_url: string | null;
  file_path: string | null;
  file_url: string | null;
  key_takeaways: string[];
  sort_order: number;
  status: "published" | "draft";
  has_file: boolean;
  has_link: boolean;
}

export type WellnessLessonPayload = {
  title?: string;
  description?: string;
  duration_min?: number;
  link_url?: string | null;
  video_url?: string | null;
  key_takeaways?: string[];
  sort_order?: number;
  status?: "published" | "draft";
  remove_file?: boolean;
  file?: File | null;
};

function buildLessonFormData(payload: WellnessLessonPayload) {
  const form = new FormData();
  if (payload.title !== undefined) form.append("title", payload.title);
  if (payload.description !== undefined) form.append("description", payload.description ?? "");
  if (payload.duration_min !== undefined) form.append("duration_min", String(payload.duration_min));
  if (payload.link_url !== undefined) {
    const link = payload.link_url?.trim() ?? "";
    form.append("link_url", link);
    form.append("video_url", link);
  } else if (payload.video_url !== undefined) {
    const link = payload.video_url?.trim() ?? "";
    form.append("link_url", link);
    form.append("video_url", link);
  }
  if (payload.status !== undefined) form.append("status", payload.status);
  if (payload.sort_order !== undefined) form.append("sort_order", String(payload.sort_order));
  if (payload.key_takeaways) {
    form.append("key_takeaways", JSON.stringify(payload.key_takeaways));
  }
  if (payload.remove_file) form.append("remove_file", "1");
  if (payload.file) form.append("file", payload.file);
  return form;
}

function buildLessonJsonBody(payload: WellnessLessonPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.description !== undefined) body.description = payload.description ?? "";
  if (payload.duration_min !== undefined) body.duration_min = payload.duration_min;
  if (payload.link_url !== undefined) {
    const link = payload.link_url?.trim() || null;
    body.link_url = link;
    body.video_url = link;
  } else if (payload.video_url !== undefined) {
    const link = payload.video_url?.trim() || null;
    body.link_url = link;
    body.video_url = link;
  }
  if (payload.status !== undefined) body.status = payload.status;
  if (payload.sort_order !== undefined) body.sort_order = payload.sort_order;
  if (payload.key_takeaways !== undefined) body.key_takeaways = payload.key_takeaways;
  if (payload.remove_file) body.remove_file = true;
  return body;
}

export async function fetchWellnessCategories() {
  const res = await api.get("/v1/admin/wellness/categories");
  return res.data.data as WellnessCategory[];
}

export async function createWellnessCategory(payload: {
  title: string;
  subtitle?: string;
  icon_key?: string;
  color?: string;
  image_url?: string | null;
  sort_order?: number;
  status?: "active" | "inactive";
}) {
  const res = await api.post("/v1/admin/wellness/categories", payload);
  return res.data.data as WellnessCategory;
}

export async function updateWellnessCategory(
  id: number,
  payload: Partial<Pick<WellnessCategory, "title" | "subtitle" | "icon_key" | "color" | "image_url" | "sort_order" | "status">>,
) {
  const res = await api.post(`/v1/admin/wellness/categories/${id}`, payload);
  return res.data.data as WellnessCategory;
}

export async function deleteWellnessCategory(id: number) {
  return api.delete(`/v1/admin/wellness/categories/${id}`);
}

export async function uploadWellnessCategoryImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  const res = await api.post("/v1/admin/wellness/categories/upload-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data.image_url as string;
}

export async function fetchWellnessCourses(params?: { category_id?: number; search?: string }) {
  const res = await api.get("/v1/admin/wellness/courses", { params });
  return res.data.data as WellnessCourse[];
}

export async function uploadWellnessCourseImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  const res = await api.post("/v1/admin/wellness/courses/upload-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data.image_url as string;
}

export async function createWellnessCourse(payload: {
  category_id: number;
  title: string;
  description: string;
  image_url?: string | null;
  sort_order?: number;
  status?: "published" | "draft";
}) {
  const res = await api.post("/v1/admin/wellness/courses", payload);
  return res.data.data as WellnessCourse;
}

export async function updateWellnessCourse(id: number, payload: Partial<WellnessCourse>) {
  const res = await api.post(`/v1/admin/wellness/courses/${id}`, payload);
  return res.data.data as WellnessCourse;
}

export async function deleteWellnessCourse(id: number) {
  return api.delete(`/v1/admin/wellness/courses/${id}`);
}

export async function fetchWellnessLessons(courseId: number) {
  const res = await api.get(`/v1/admin/wellness/courses/${courseId}/lessons`);
  return res.data.data as WellnessLesson[];
}

export async function createWellnessLesson(courseId: number, payload: WellnessLessonPayload) {
  const form = buildLessonFormData(payload);
  const res = await api.post(`/v1/admin/wellness/courses/${courseId}/lessons`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as WellnessLesson;
}

export async function updateWellnessLesson(id: number, payload: WellnessLessonPayload) {
  if (payload.file) {
    const form = buildLessonFormData(payload);
    form.append("_method", "PATCH");
    const res = await api.post(`/v1/admin/wellness/lessons/${id}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data as WellnessLesson;
  }

  const res = await api.post(`/v1/admin/wellness/lessons/${id}`, buildLessonJsonBody(payload));
  return res.data.data as WellnessLesson;
}

export async function deleteWellnessLesson(id: number) {
  return api.delete(`/v1/admin/wellness/lessons/${id}`);
}
