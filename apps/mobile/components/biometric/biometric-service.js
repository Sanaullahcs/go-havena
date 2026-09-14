import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import i18n from "../../i18n";
import {
  getToken,
  getUser,
  getCommunityId,
  getBiometricUnlockCredentials,
  setSession,
  setCommunityId,
  clearSession,
  clearBiometricUnlock,
} from "../../services/auth-session";
import { getPrimaryMembership } from "../../services/community-access";
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
      cancelLabel: i18n.t("common.cancel"),
      fallbackLabel: i18n.t("auth.usePasscode"),
      disableDeviceFallback: false,
    };

    if (Platform.OS === "android") {
      options.requireConfirmation = false;
      options.promptSubtitle = i18n.t("auth.verifyIdentity");
    }

    return await LocalAuthentication.authenticateAsync(options);
  } catch (error) {
    console.warn("Biometric Error:", error);
    return { success: false, error: "unknown" };
  }
}

async function restoreCommunityFromUser(user) {
  const approved = (user?.memberships ?? []).filter((m) => m.status === "approved");
  const stored = await getCommunityId();
  let next = getPrimaryMembership(user);
  if (stored) {
    const match = approved.find((m) => String(m.community_id) === String(stored));
    if (match) next = match;
  }
  if (next?.community_id) {
    await setCommunityId(next.community_id);
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
      message: i18n.t("auth.signInWithPhoneFirst"),
    };
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) {
    return {
      success: false,
      code: BIOMETRIC_ERROR.NOT_AVAILABLE,
      message:
        Platform.OS === "ios"
          ? i18n.t("auth.deviceNoFaceId")
          : i18n.t("auth.deviceNoFingerprint"),
    };
  }

  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!isEnrolled) {
    return {
      success: false,
      code: BIOMETRIC_ERROR.NOT_ENROLLED,
      message:
        Platform.OS === "ios"
          ? i18n.t("auth.setupFaceId")
          : i18n.t("auth.setupFingerprint"),
    };
  }

  return { success: true, token, user, needsRestore };
}

function mapAuthFailure(result) {
  if (result.error === "user_cancel" || result.error === "system_cancel") {
    return {
      success: false,
      code: BIOMETRIC_ERROR.CANCELLED,
      message: i18n.t("auth.authCancelled"),
    };
  }

  return {
    success: false,
    code: BIOMETRIC_ERROR.FAILED,
    message: i18n.t("auth.authFailed"),
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
        message: i18n.t("auth.sessionExpiredBiometric"),
      };
    }

    if (user) {
      await restoreCommunityFromUser(user);
      return { success: true, user };
    }
    return {
      success: false,
      code: BIOMETRIC_ERROR.NO_SESSION,
      message: i18n.t("auth.sessionExpired"),
    };
  }
}

export async function checkBiometricLoginReady() {
  return preflightBiometricLogin();
}
