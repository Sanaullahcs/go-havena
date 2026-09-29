import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import i18n from "../i18n";
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermissionStatus,
  getRemotePushUnavailableMessage,
  isRemotePushSupported,
  PUSH_ERROR,
} from "../services/push-notifications";
import {
  getEmailNotificationsEnabled,
  getPushNotificationsEnabled,
  setEmailNotificationsEnabled,
} from "../services/notification-preferences";

export function usePushNotificationSettings() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [pushSupported] = useState(() => isRemotePushSupported());
  const [loading, setLoading] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const pushUnavailableMessage = getRemotePushUnavailableMessage();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [storedPush, storedEmail, permission] = await Promise.all([
        getPushNotificationsEnabled(),
        getEmailNotificationsEnabled(),
        getNotificationPermissionStatus(),
      ]);

      // Only show enabled when remote push is supported and OS permission is granted.
      setPushEnabled(Boolean(storedPush && pushSupported && permission === "granted"));
      setEmailEnabled(storedEmail);
    } finally {
      setLoading(false);
    }
  }, [pushSupported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setPush = useCallback(async (nextValue) => {
    if (pushBusy) return { ok: false, reason: "busy", message: i18n.t("settings.pleaseWait") };

    setPushBusy(true);
    try {
      if (nextValue) {
        await enablePushNotifications();
        setPushEnabled(true);
        return { ok: true };
      }

      await disablePushNotifications();
      setPushEnabled(false);
      return { ok: true };
    } catch (err) {
      console.warn("[push] settings toggle failed", err);
      setPushEnabled(false);

      if (
        err?.code === PUSH_ERROR.PERMISSION_DENIED ||
        /denied|permission/i.test(String(err?.message ?? ""))
      ) {
        return { ok: false, reason: "permission_denied" };
      }

      return { ok: false, reason: "enable_failed" };
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy]);

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

  const openSystemSettings = useCallback(async () => {
    if (Platform.OS === "ios") {
      await Linking.openURL("app-settings:");
      return;
    }
    await Linking.openSettings();
  }, []);

  return {
    pushEnabled,
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
