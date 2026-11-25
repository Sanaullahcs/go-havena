import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { useFocusEffect } from "expo-router";
import i18n from "../i18n";
import { fetchAccountPushPreference, saveAccountPushPreference } from "../services/devices-api";
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermissionStatus,
  rememberForegroundPushState,
  getRemotePushUnavailableMessage,
  isRemotePushSupported,
  PUSH_ERROR,
} from "../services/push-notifications";
import {
  getEmailNotificationsEnabled,
  getPushNotificationsEnabled,
  setEmailNotificationsEnabled,
  setPushNotificationsEnabled,
} from "../services/notification-preferences";
import { getToken } from "../services/auth-session";
import { isExpoGo } from "../utils/expo-runtime";

async function savePushPreference(enabled) {
  try {
    await saveAccountPushPreference(enabled);
  } catch (err) {
    if (err?.status === 403) return;
    throw err;
  }
}

export function usePushNotificationSettings() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [systemPermission, setSystemPermission] = useState(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [pushSupported] = useState(() => isRemotePushSupported());
  const [loading, setLoading] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const permissionRef = useRef(null);
  const pushUnavailableMessage = getRemotePushUnavailableMessage();

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [storedPush, storedEmail, permission, authToken] = await Promise.all([
        getPushNotificationsEnabled(),
        getEmailNotificationsEnabled(),
        getNotificationPermissionStatus(),
        getToken(),
      ]);

      let accountEnabled = storedPush;
      if (authToken) {
        try {
          accountEnabled = await fetchAccountPushPreference();
          if (accountEnabled !== storedPush) {
            await setPushNotificationsEnabled(accountEnabled);
          }
        } catch {
          accountEnabled = storedPush;
        }
      }

      const previousPermission = permissionRef.current;
      permissionRef.current = permission;
      setSystemPermission(permission);
      const systemOn = permission === "granted";
      rememberForegroundPushState(accountEnabled, isExpoGo() ? "granted" : permission);
      setPushEnabled(Boolean(accountEnabled && (isExpoGo() || (pushSupported && systemOn))));
      setEmailEnabled(storedEmail);

      if (accountEnabled && systemOn && previousPermission && previousPermission !== "granted") {
        enablePushNotifications().catch((err) => {
          console.warn("[push] resume after system permission failed", err);
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [pushSupported]);

  useFocusEffect(
    useCallback(() => {
      refresh({ silent: permissionRef.current != null });
    }, [refresh]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh({ silent: true });
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const openSystemSettings = useCallback(async () => {
    if (Platform.OS === "android") {
      try {
        const packageName = Constants.expoConfig?.android?.package;
        if (packageName) {
          await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [
            { key: "android.provider.extra.APP_PACKAGE", value: packageName },
          ]);
          return;
        }
      } catch {
        // Fall through to the app details screen.
      }
    }

    try {
      await Linking.openSettings();
    } catch {
      await Linking.openURL("app-settings:");
    }
  }, []);

  const setPush = useCallback(async (nextValue) => {
    if (pushBusy) return { ok: false, reason: "busy", message: i18n.t("settings.pleaseWait") };

    setPushBusy(true);
    try {
      if (nextValue) {
        if (isExpoGo()) {
          await savePushPreference(true);
          await setPushNotificationsEnabled(true);
          rememberForegroundPushState(true, "granted");
          setPushEnabled(true);
          return { ok: true };
        }

        const current = await getNotificationPermissionStatus();
        if (current === "denied") {
          await savePushPreference(true);
          await setPushNotificationsEnabled(true);
          setSystemPermission(current);
          setPushEnabled(false);
          await openSystemSettings();
          return { ok: false, reason: "opened_settings" };
        }

        await enablePushNotifications();
        await savePushPreference(true);
        setSystemPermission("granted");
        setPushEnabled(true);
        return { ok: true };
      }

      await savePushPreference(false);
      await disablePushNotifications();
      setPushEnabled(false);
      return { ok: true };
    } catch (err) {
      console.warn("[push] settings toggle failed", err);
      const denied = err?.code === PUSH_ERROR.PERMISSION_DENIED;

      if (denied) {
        await savePushPreference(true).catch(() => {});
        await setPushNotificationsEnabled(true);
        setSystemPermission("denied");
        setPushEnabled(false);
        return { ok: false, reason: "permission_denied" };
      }

      const permission = await getNotificationPermissionStatus().catch(() => null);
      const stored = await getPushNotificationsEnabled().catch(() => false);
      setSystemPermission(permission);
      setPushEnabled(Boolean(stored && permission === "granted" && pushSupported));
      return { ok: false, reason: "enable_failed" };
    } finally {
      setPushBusy(false);
    }
  }, [openSystemSettings, pushBusy, pushSupported]);

  const setEmail = useCallback(async (nextValue) => {
    if (emailBusy) return { ok: false, message: i18n.t("settings.pleaseWait") };

    setEmailBusy(true);
    try {
      await setEmailNotificationsEnabled(nextValue);
      setEmailEnabled(nextValue);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message ?? i18n.t("settings.emailPreferenceFailed") };
    } finally {
      setEmailBusy(false);
    }
  }, [emailBusy]);

  return {
    pushEnabled,
    systemPermission,
    emailEnabled,
    pushSupported,
    pushUnavailableMessage,
    loading,
    pushBusy,
    emailBusy,
    refresh,
    setPush,
    setEmail,
    openSystemSettings,
  };
}
