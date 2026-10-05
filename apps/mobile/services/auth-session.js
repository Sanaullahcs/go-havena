import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "nbr_auth_token";
const USER_KEY = "nbr_auth_user";
const COMMUNITY_KEY = "nbr_community_id";
/** Kept after logout so fingerprint / Face ID can unlock without email OTP again */
const BIOMETRIC_TOKEN_KEY = "nbr_biometric_token";
const BIOMETRIC_USER_KEY = "nbr_biometric_user";
const BLOCKED_NOTICE_KEY = "nbr_blocked_notice";

let memoryToken = null;
let memoryUser = null;
let memoryCommunityId = null;
let guestSessionTerminatedHandler = null;
const sessionUserListeners = new Set();

function emitSessionUser(user) {
  memoryUser = user ?? null;
  sessionUserListeners.forEach((listener) => {
    try {
      listener(memoryUser);
    } catch {
      // UI listeners must not break session writes.
    }
  });
}

/** Subscribe to cached session user changes (mode switch, /me sync, logout). */
export function subscribeSessionUser(listener) {
  sessionUserListeners.add(listener);
  return () => sessionUserListeners.delete(listener);
}

export function setGuestSessionTerminatedHandler(handler) {
  guestSessionTerminatedHandler = handler;
}

export async function notifyGuestSessionTerminated(notice = "GUEST_ACCESS_REVOKED") {
  if (!guestSessionTerminatedHandler) return;

  // Defer navigation until the current render / fetch cycle completes.
  setTimeout(() => {
    guestSessionTerminatedHandler?.(notice);
  }, 0);
}

async function storageGet(key) {
  if (Platform.OS === "web") {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

async function storageSet(key, value) {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

async function storageDelete(key) {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    return;
  }
  return SecureStore.deleteItemAsync(key);
}

async function deleteKeyBestEffort(key) {
  try {
    await storageDelete(key);
  } catch (err) {
    console.warn(`[auth] failed to delete ${key}`, err);
    try {
      await storageSet(key, "");
      await storageDelete(key);
    } catch {
      // best-effort
    }
  }
}

export async function getToken({ reload = false } = {}) {
  if (!reload && memoryToken) return memoryToken;
  const stored = await storageGet(TOKEN_KEY);
  memoryToken = stored && stored.length > 0 ? stored : null;
  return memoryToken;
}

export async function setSession({ token, user }) {
  memoryToken = token;
  emitSessionUser(user);
  try {
    await storageSet(TOKEN_KEY, token);
    if (user) {
      await storageSet(USER_KEY, JSON.stringify(user));
    }
    // Sync unlock credentials so biometrics work after a later logout
    await storageSet(BIOMETRIC_TOKEN_KEY, token);
    if (user) {
      await storageSet(BIOMETRIC_USER_KEY, JSON.stringify(user));
    }
  } catch (err) {
    memoryToken = token;
    memoryUser = user;
    console.warn("[auth] SecureStore failed, using in-memory session", err);
  }
}

export async function getUser({ reload = false } = {}) {
  // Keep the live session. A disk read can still hold the previous feature flags
  // while /me is being saved, and must not put that older set back in memory.
  if (memoryUser) return memoryUser;
  void reload;
  const raw = await storageGet(USER_KEY);
  if (!raw) return null;
  try {
    if (memoryUser) return memoryUser;
    memoryUser = JSON.parse(raw);
    return memoryUser;
  } catch {
    return null;
  }
}

/** Merge fields into the cached session user without replacing the auth token. */
export async function patchCachedUser(patch) {
  if (!patch || typeof patch !== "object") return null;

  const user = await getUser({ reload: true });
  if (!user) return null;

  const next = { ...user, ...patch };
  emitSessionUser(next);

  try {
    await storageSet(USER_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("[auth] failed to patch cached user", err);
  }

  return next;
}

/** Synchronous in-memory user (for UI that must not flash before async storage reads). */
export function getCachedUser() {
  return memoryUser;
}

export async function setCommunityId(id) {
  memoryCommunityId = id != null ? String(id) : null;
  if (memoryCommunityId) {
    await storageSet(COMMUNITY_KEY, memoryCommunityId);
  } else {
    await storageDelete(COMMUNITY_KEY);
  }
}

export async function getCommunityId() {
  if (memoryCommunityId) return memoryCommunityId;
  memoryCommunityId = await storageGet(COMMUNITY_KEY);
  return memoryCommunityId;
}

/** Credentials saved for biometric unlock after logout */
export async function getBiometricUnlockCredentials() {
  const token = await storageGet(BIOMETRIC_TOKEN_KEY);
  if (!token || token.length === 0) return null;

  let user = null;
  const raw = await storageGet(BIOMETRIC_USER_KEY);
  if (raw) {
    try {
      user = JSON.parse(raw);
    } catch {
      user = null;
    }
  }

  return { token, user };
}

export async function clearBiometricUnlock() {
  await deleteKeyBestEffort(BIOMETRIC_TOKEN_KEY);
  await deleteKeyBestEffort(BIOMETRIC_USER_KEY);
}

/**
 * Clear the active session.
 * @param {{ keepBiometricUnlock?: boolean }} [options]
 *   keepBiometricUnlock: true on user logout so Face ID / fingerprint can unlock again.
 *   false (default) when the session is invalid / account suspended.
 */
export async function clearSession({ keepBiometricUnlock = false } = {}) {
  const keys = [TOKEN_KEY, USER_KEY, COMMUNITY_KEY];
  for (const key of keys) {
    await deleteKeyBestEffort(key);
  }
  memoryToken = null;
  emitSessionUser(null);
  memoryCommunityId = null;

  if (!keepBiometricUnlock) {
    await clearBiometricUnlock();
  }
}

export async function isAuthenticated() {
  return Boolean(await getToken());
}

export async function hasBiometricUnlock() {
  const creds = await getBiometricUnlockCredentials();
  return Boolean(creds?.token);
}

/** Persist blocked-account details for the login screen after session clear. */
export async function setBlockedAccountNotice(notice) {
  if (!notice) return;
  try {
    await storageSet(BLOCKED_NOTICE_KEY, JSON.stringify(notice));
  } catch (err) {
    console.warn("[auth] failed to store blocked notice", err);
  }
}

/** Read and clear blocked-account details shown once on login. */
export async function consumeBlockedAccountNotice() {
  const raw = await storageGet(BLOCKED_NOTICE_KEY);
  if (!raw) return null;

  await deleteKeyBestEffort(BLOCKED_NOTICE_KEY);

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
