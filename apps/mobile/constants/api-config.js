import { Platform } from "react-native";
import Constants from "expo-constants";
import { extractNationalDigits } from "../utils/phone";

/** UAT / production testing server */
export const PRODUCTION_API_URL = "https://apis.gohavena.com/api/v1";

/** Android emulator → host machine (`php artisan serve --host=0.0.0.0 --port=8000`) */
const DEV_ANDROID_EMULATOR = "http://10.0.2.2:8000/api/v1";
const DEV_IOS_SIMULATOR = "http://127.0.0.1:8000/api/v1";
const DEFAULT_LAN_PORT = "8000";

/** Dev/test credentials — use on login & signup in local builds */
export const DEV_TEST_PHONE_DIGITS = "5555550100";
export const DEV_TEST_PHONE_RAW = "5555550100";
export const DEV_TEST_PHONE_DISPLAY = "(555) 555-0100";
export const DEV_TEST_PHONE_E164 = "+15555550100";

/** Fully onboarded community admin test account */
export const DEV_COMMUNITY_ADMIN_PHONE_DIGITS = "5555550200";
export const DEV_COMMUNITY_ADMIN_PHONE_DISPLAY = "(555) 555-0200";
export const DEV_COMMUNITY_ADMIN_PHONE_E164 = "+15555550200";

/** Legacy resident dev phone (Sarah Mitchell) */
export const DEV_LEGACY_RESIDENT_PHONE_DISPLAY = "(555) 555-5555";
export const DEV_LEGACY_RESIDENT_PHONE_E164 = "+15555555555";
export const DEV_OTP_HINT = "221322";
export const DEV_INVITE_CODE = "MAPLE-2024-XYZ";
export const DEV_OFFLINE_TOKEN = "dev-offline-token";
/** Routes all API calls through the in-app mock layer (dev only). */
export const MOCK_DEMO_TOKEN = "mock-demo-token";

function getPackagerHost() {
  const raw =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    Constants.manifest?.debuggerHost;

  if (!raw) return null;
  return String(raw).split(":")[0];
}

function lanApiFromHost(host) {
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return `http://${host}:${DEFAULT_LAN_PORT}/api/v1`;
}

/** Temporary public tunnels — avoid when phone can hit LAN API on same Wi-Fi. */
function isDevTunnelApiUrl(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return (
      hostname.endsWith(".loca.lt") ||
      hostname.endsWith(".ngrok-free.app") ||
      hostname.endsWith(".ngrok.io") ||
      hostname.endsWith(".trycloudflare.com")
    );
  } catch {
    return false;
  }
}

/** Physical Android device vs emulator (Expo Go / AVD). */
function isAndroidEmulator() {
  if (Platform.OS !== "android") return false;
  if (Constants.isDevice === false) return true;
  const host = getPackagerHost();
  return host === "10.0.2.2" || host === "localhost" || host === "127.0.0.1";
}

/**
 * Dev API URL resolution (highest priority first):
 * 1. Android emulator → 10.0.2.2:8000
 * 2. http EXPO_PUBLIC_API_URL with a private LAN IP (same Wi-Fi; works even when Metro uses --tunnel)
 * 3. Metro packager LAN host (not exp.direct tunnel) → http://{host}:8000
 * 4. https EXPO_PUBLIC_API_URL (UAT / staging / loca.lt API tunnel)
 * 5. Other http EXPO_PUBLIC_API_URL, then platform simulator defaults
 *
 * Run start-lan.ps1 to refresh .env after a Wi-Fi / IP change.
 */
function resolveApiBaseUrl() {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim()?.replace(/\/$/, "");

  // Release APK / production builds always use the testing server (or explicit env override).
  if (!__DEV__) {
    return envUrl || PRODUCTION_API_URL;
  }

  const packagerHost = getPackagerHost();
  const isTunnelHost = packagerHost?.includes("exp.direct");
  const envLanUrl =
    envUrl && /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(envUrl)
      ? envUrl
      : null;
  const onPhysicalDevice = Constants.isDevice !== false;

  // Android emulator cannot reach the PC LAN IP — bridge via 10.0.2.2 (must beat .env LAN URL).
  if (isAndroidEmulator()) {
    return DEV_ANDROID_EMULATOR;
  }

  // Physical phone + stale Metro host (localhost) → trust .env LAN URL from start:lan.
  if (onPhysicalDevice && envLanUrl) {
    if (!packagerHost || packagerHost === "localhost" || packagerHost === "127.0.0.1" || isTunnelHost) {
      return envLanUrl;
    }
  }

  // Prefer live Metro LAN IP so login still works after Wi-Fi / hotspot changes (stale .env is common).
  if (packagerHost && !isTunnelHost) {
    const lanUrl = lanApiFromHost(packagerHost);
    if (lanUrl) return lanUrl;
  }

  // Fallback: explicit LAN http API in .env (physical device on same Wi-Fi).
  if (envLanUrl) {
    return envLanUrl;
  }

  // Remote UAT / staging / API tunnel in .env (https://...) — loca.lt URLs expire often.
  if (envUrl && /^https:\/\//.test(envUrl)) {
    return envUrl;
  }

  // Fallback: explicit http API in .env (physical device on same Wi-Fi).
  if (envUrl && /^http:\/\//.test(envUrl)) {
    return envUrl;
  }

  if (Platform.OS === "android") {
    return DEV_ANDROID_EMULATOR;
  }

  if (Platform.OS === "ios") {
    return DEV_IOS_SIMULATOR;
  }

  return DEV_IOS_SIMULATOR;
}

export const API_BASE_URL = resolveApiBaseUrl();

/** Admin web portal base (no trailing slash). Used for mobile → browser billing handoff. */
export function resolveAdminPortalBaseUrl() {
  const envAdmin = process.env.EXPO_PUBLIC_ADMIN_URL?.trim()?.replace(/\/$/, "");
  if (envAdmin) {
    return envAdmin.replace(/\/admin(?:\/billing)?\/?$/, "");
  }

  try {
    const api = new URL(API_BASE_URL);
    return `${api.protocol}//${api.hostname}:3000`;
  } catch {
    return "http://192.168.0.134:3000";
  }
}

if (__DEV__) {
  console.log("[Havena] API base URL:", API_BASE_URL);
}

export function isDevTestPhone(input) {
  const digits = extractNationalDigits(input);
  return digits === DEV_TEST_PHONE_DIGITS || digits === DEV_COMMUNITY_ADMIN_PHONE_DIGITS;
}

export function isRemoteApi() {
  return /^https:\/\//.test(API_BASE_URL);
}

export function describeApiConnectionHint() {
  if (isDevTunnelApiUrl(API_BASE_URL)) {
    return "Using API tunnel. If login fails, run start-lan.ps1 (same Wi-Fi) or restart start-api-tunnel.ps1.";
  }
  if (API_BASE_URL.includes("10.0.2.2")) {
    return `Using Android emulator API at ${API_BASE_URL}. Run: npm run backend`;
  }
  if (API_BASE_URL.includes("192.168.") || /\/\/10\.\d/.test(API_BASE_URL)) {
    return `Using LAN API at ${API_BASE_URL}. Phone must be on the same Wi-Fi and port ${DEFAULT_LAN_PORT} must be allowed in Windows Firewall.`;
  }
  return `API: ${API_BASE_URL}. Run: npm run backend`;
}
