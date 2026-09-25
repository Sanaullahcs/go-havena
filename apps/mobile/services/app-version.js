import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { compareSemver, isSemverLessThan } from "../utils/semver";

const DEV_VERSION_OVERRIDE_KEY = "havena.dev.installed_app_version";

/** In-memory override for __DEV__ only (takes precedence over SecureStore). */
let memoryDevVersionOverride = null;
const versionCheckListeners = new Set();

export function subscribeAppVersionCheck(listener) {
  versionCheckListeners.add(listener);
  return () => versionCheckListeners.delete(listener);
}

export function requestAppVersionRecheck() {
  versionCheckListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
}

export function getNativePlatform() {
  return Platform.OS === "ios" ? "ios" : "android";
}

/**
 * Real installed app version from the native binary / Expo config.
 * Never returns the __DEV__ override — use getInstalledAppVersion() for checks.
 */
export function getRealInstalledAppVersion() {
  const native =
    Constants.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    null;
  return native ? String(native) : "0.0.0";
}

/**
 * Version used for update policy checks.
 * In production builds, always the real installed version.
 * In __DEV__, may be overridden for Force Update UI testing.
 */
export async function getInstalledAppVersion() {
  if (__DEV__) {
    if (memoryDevVersionOverride) {
      return String(memoryDevVersionOverride);
    }
    try {
      const stored = await SecureStore.getItemAsync(DEV_VERSION_OVERRIDE_KEY);
      if (stored) return String(stored);
    } catch {
      // ignore
    }
  }
  return getRealInstalledAppVersion();
}

/** __DEV__ only — set installed version override used by the update gate. */
export async function setDevInstalledVersionOverride(version) {
  if (!__DEV__) return;
  const next = version ? String(version).trim() : "";
  memoryDevVersionOverride = next || null;
  try {
    if (next) {
      await SecureStore.setItemAsync(DEV_VERSION_OVERRIDE_KEY, next);
    } else {
      await SecureStore.deleteItemAsync(DEV_VERSION_OVERRIDE_KEY);
    }
  } catch {
    // ignore
  }
  requestAppVersionRecheck();
}

/** __DEV__ only */
export async function getDevInstalledVersionOverride() {
  if (!__DEV__) return null;
  if (memoryDevVersionOverride) return memoryDevVersionOverride;
  try {
    return (await SecureStore.getItemAsync(DEV_VERSION_OVERRIDE_KEY)) || null;
  } catch {
    return null;
  }
}

export async function clearDevInstalledVersionOverride() {
  await setDevInstalledVersionOverride("");
}

/**
 * @param {{ latest_version: string, minimum_version: string, force_update: boolean, store_url: string }} policy
 * @param {string} installedVersion
 * @returns {'none' | 'optional' | 'force'}
 */
export function evaluateUpdateRequirement(policy, installedVersion) {
  if (!policy || !installedVersion) return "none";

  const minimum = policy.minimum_version || "0.0.0";
  const latest = policy.latest_version || minimum;
  const forceEnabled = !!policy.force_update;

  if (forceEnabled && isSemverLessThan(installedVersion, minimum)) {
    return "force";
  }

  if (isSemverLessThan(installedVersion, latest) && compareSemver(installedVersion, minimum) >= 0) {
    return "optional";
  }

  return "none";
}
