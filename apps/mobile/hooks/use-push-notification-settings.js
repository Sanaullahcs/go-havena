import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermissionStatus,
  getRemotePushUnavailableMessage,
  isRemotePushSupported,
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

      setPushEnabled(
        storedPush && (pushSupported ? permission === "granted" : true),
      );
      setEmailEnabled(storedEmail);
    } finally {
      setLoading(false);
    }
  }, [pushSupported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setPush = useCallback(async (nextValue) => {
    if (pushBusy) return { ok: false, message: "Please wait…" };

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
      const message = err?.message ?? "Could not update push notifications.";
      setPushEnabled(false);
      return { ok: false, message };
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy]);

  const setEmail = useCallback(async (nextValue) => {
    if (emailBusy) return { ok: false, message: "Please wait…" };

    setEmailBusy(true);
    try {
      await setEmailNotificationsEnabled(nextValue);
      setEmailEnabled(nextValue);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message ?? "Could not save email preference." };
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
