import { MOCK_DEMO_TOKEN } from "./api-config";

export const MOCK_COMMUNITY_ID = 1;
export const MOCK_RESIDENT_USER_ID = 101;
export const MOCK_ADMIN_USER_ID = 201;

/**
 * Mock fixtures are ON in dev builds by default.
 * Set EXPO_PUBLIC_USE_MOCK_DATA=0 in apps/mobile/.env to hit the real API instead.
 */
export function isMockDataEnvEnabled() {
  if (!__DEV__) return false;
  const raw = process.env.EXPO_PUBLIC_USE_MOCK_DATA;
  const flag = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (flag === "0" || flag === "false" || flag === "no") return false;
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return true;
}

/** Session token that always routes API through the mock layer. */
export function isMockDemoToken(token) {
  return __DEV__ && token === MOCK_DEMO_TOKEN;
}

/** True when mock fixtures should drive API responses (dev builds only). */
export function shouldUseMockDataSync(token) {
  if (!__DEV__) return false;
  return isMockDataEnvEnabled() || isMockDemoToken(token);
}

export function isMockApiActive(token) {
  return shouldUseMockDataSync(token);
}
