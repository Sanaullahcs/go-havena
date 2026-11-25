import api from "./client";

export interface WellnessItem {
  id: number; category: string; title: string;
  description: string; duration_min: number;
  image_url: string | null; completed: boolean;
}

export interface WellnessCategory {
  items: WellnessItem[]; completed: number; total: number;
}

export async function fetchWellness() {
  const res = await api.get("/v1/wellness");
  return res.data.data as Record<string, WellnessCategory>;
}

export async function completeLesson(id: number) {
  // Prefer course-lesson progress; fall back to legacy flat content endpoint.
  try {
    return await api.post(`/v1/wellness/lessons/${id}/complete`);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return api.post(`/v1/wellness/${id}/complete`);
    throw err;
  }
}

export async function uncompleteLesson(id: number) {
  // Prefer DELETE; fall back to POST (hosting often blocks DELETE) then legacy routes.
  try {
    return await api.delete(`/v1/wellness/lessons/${id}/complete`);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 403 || status === 405 || status === 404) {
      try {
        return await api.post(`/v1/wellness/lessons/${id}/uncomplete`);
      } catch (err2: unknown) {
        const status2 = (err2 as { response?: { status?: number } })?.response?.status;
        if (status2 === 404) {
          try {
            return await api.delete(`/v1/wellness/${id}/complete`);
          } catch {
            return api.post(`/v1/wellness/${id}/uncomplete`);
          }
        }
        throw err2;
      }
    }
    throw err;
  }
}
