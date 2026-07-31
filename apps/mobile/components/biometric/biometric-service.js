import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import {
  getToken,
  getUser,
  getBiometricUnlockCredentials,
  setSession,
  setCommunityId,
  clearSession,
  clearBiometricUnlock,
} from "../../services/auth-session";
import { fetchMe } from "../../services/auth-api";
import { DEV_OFFLINE_TOKEN } from "../../constants/api-config";
import { ApiError } from "../../services/api-client";

export const BIOMETRIC_ERROR = {
  NO_SESSION: "NO_SESSION",
  NOT_AVAILABLE: "NOT_AVAILABLE",
  NOT_ENROLLED: "NOT_ENROLLED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
};

export async function isBiometricAvailable() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  return LocalAuthentication.isEnrolledAsync();
}

export async function getBiometricTypes() {
  return LocalAuthentication.supportedAuthenticationTypesAsync();
}

export async function authenticate(promptMessage = "Authenticate") {
  try {
    const options = {
      promptMessage,
      cancelLabel: "Cancel",
      fallbackLabel: "Use Passcode",
      disableDeviceFallback: false,
    };

    if (Platform.OS === "android") {
      options.requireConfirmation = false;
      options.promptSubtitle = "Verify your identity to continue";
    }

    return await LocalAuthentication.authenticateAsync(options);
  } catch (error) {
    console.warn("Biometric Error:", error);
    return { success: false, error: "unknown" };
  }
}

async function restoreCommunityFromUser(user) {
  const memberships = user?.memberships ?? [];
  const approved = memberships.find((m) => m.status === "approved");
  const admin = memberships.find(
    (m) => m.status === "approved" && ["admin", "moderator"].includes(m.role),
  );
  const membership = admin ?? approved;
  if (membership?.community_id) {
    await setCommunityId(membership.community_id);
  }
}

async function preflightBiometricLogin() {
  let token = await getToken({ reload: true });
  let user = await getUser({ reload: true });
  let needsRestore = false;

  if (!token) {
    const unlock = await getBiometricUnlockCredentials();
    if (unlock?.token) {
      token = unlock.token;
      user = unlock.user ?? user;
      needsRestore = true;
    }
  }

  if (!token) {
    return {
      success: false,
      code: BIOMETRIC_ERROR.NO_SESSION,
      message:
        "Sign in with your phone number once. After that, fingerprint or Face ID unlocks your account.",
    };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) {
    return {
      success: false,
      code: BIOMETRIC_ERROR.NOT_AVAILABLE,
      message:
        Platform.OS === "ios"
          ? "This device does not support Face ID."
          : "This device does not support fingerprint or face unlock.",
    };
  }

  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!isEnrolled) {
    return {
      success: false,
      code: BIOMETRIC_ERROR.NOT_ENROLLED,
      message:
        Platform.OS === "ios"
          ? "Set up Face ID in Settings first."
          : "Set up fingerprint or face unlock in your device settings first.",
    };
  }

  return { success: true, token, user, needsRestore };
}

function mapAuthFailure(result) {
  if (result.error === "user_cancel" || result.error === "system_cancel") {
    return {
      success: false,
      code: BIOMETRIC_ERROR.CANCELLED,
      message: "Authentication was cancelled.",
    };
  }

  return {
    success: false,
    code: BIOMETRIC_ERROR.FAILED,
    message: "Authentication failed. Try again or use phone sign-in.",
  };
}

/**
 * Biometric unlock for returning users.
 * Returns { success, user } so the UI can navigate to the dashboard.
 */
export async function verifyBiometricLogin(promptMessage = "Authenticate") {
  const preflight = await preflightBiometricLogin();
  if (!preflight.success) {
    return preflight;
  }

  const result = await authenticate(promptMessage);

  if (!result.success) {
    return mapAuthFailure(result);
  }

  let token = preflight.token;
  let user = preflight.user ?? null;

  if (preflight.needsRestore && token) {
    await setSession({ token, user: user ?? undefined });
    await restoreCommunityFromUser(user);
  }

  token = (await getToken({ reload: true })) ?? token;
  user = (await getUser({ reload: true })) ?? user;

  if (__DEV__ && token === DEV_OFFLINE_TOKEN && user) {
    return { success: true, user };
  }

  try {
    const fresh = await fetchMe();
    return { success: true, user: fresh ?? (await getUser({ reload: true })) };
  } catch (error) {
    console.warn("Biometric: profile refresh failed, using local session", error);

    // Token was revoked (e.g. old hard logout) — force phone sign-in once
    if (error instanceof ApiError && error.status === 401) {
      await clearBiometricUnlock();
      await clearSession({ keepBiometricUnlock: false });
      return {
        success: false,
        code: BIOMETRIC_ERROR.NO_SESSION,
        message:
          "Your previous session expired. Sign in with your phone number once, then fingerprint will work again.",
      };
    }

    if (user) {
      await restoreCommunityFromUser(user);
      return { success: true, user };
    }
    return {
      success: false,
      code: BIOMETRIC_ERROR.NO_SESSION,
      message: "Your session expired. Sign in with your phone number again.",
    };
  }
}

export async function checkBiometricLoginReady() {
  return preflightBiometricLogin();
}
