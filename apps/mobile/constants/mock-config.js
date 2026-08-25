import { MOCK_DEMO_TOKEN } from "./api-config";
export const MOCK_COMMUNITY_ID = 1;
export const MOCK_RESIDENT_USER_ID = 101;
export const MOCK_ADMIN_USER_ID = 201;

/** True when env flag is set (dev builds only). */
export function isMockDataEnvEnabled() {
  if (!__DEV__) return false;
  const flag = process.env.EXPO_PUBLIC_USE_MOCK_DATA?.trim()?.toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/** Session token that always routes API through the mock layer. */
export function isMockDemoToken(token) {
  return __DEV__ && token === MOCK_DEMO_TOKEN;
}

export function shouldUseMockDataSync(token) {
  if (!__DEV__) return false;
  return isMockDataEnvEnabled() || isMockDemoToken(token);
}
