import { apiRequest } from "./api-client";
import { getNativePlatform } from "./app-version";

/**
 * Public version policy for the current native platform.
 * @returns {Promise<{ platform: string, latest_version: string, minimum_version: string, force_update: boolean, store_url: string } | null>}
 */
export async function fetchAppVersionPolicy(platform = getNativePlatform()) {
  try {
    const data = await apiRequest(`/app/version-policy?platform=${encodeURIComponent(platform)}`, {
      method: "GET",
      auth: false,
      community: false,
      cache: "no-store",
      timeoutMs: 8000,
    });
    return data?.data ?? null;
  } catch {
    return null;
  }
}
