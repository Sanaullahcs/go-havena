import { apiRequest } from "./api-client";
import {
  getFallbackAchievements,
  getAchievementImage,
  mapAchievementResponse,
} from "../constants/achievements-fallback";

export { getAchievementImage };

export async function fetchAchievements() {
  try {
    const res = await apiRequest("/me/achievements");
    return mapAchievementResponse(res.data ?? {});
  } catch {
    return getFallbackAchievements();
  }
}
