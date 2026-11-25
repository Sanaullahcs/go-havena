import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PUSH_ENABLED_KEY = "nbr_push_notifications_enabled";
const EMAIL_ENABLED_KEY = "nbr_email_notifications_enabled";
const PUSH_TOKEN_KEY = "nbr_expo_push_token";

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

async function readBoolean(key, defaultValue = false) {
  const raw = await storageGet(key);
  if (raw === null || raw === undefined || raw === "") return defaultValue;
  return raw === "1" || raw === "true";
}

async function writeBoolean(key, value) {
  await storageSet(key, value ? "1" : "0");
}

export async function getPushNotificationsEnabled() {
  return readBoolean(PUSH_ENABLED_KEY, false);
}

export async function setPushNotificationsEnabled(enabled) {
  await writeBoolean(PUSH_ENABLED_KEY, enabled);
}

export async function getEmailNotificationsEnabled() {
  return readBoolean(EMAIL_ENABLED_KEY, false);
}

export async function setEmailNotificationsEnabled(enabled) {
  await writeBoolean(EMAIL_ENABLED_KEY, enabled);
}

export async function getStoredPushToken() {
  const token = await storageGet(PUSH_TOKEN_KEY);
  return token && token.length > 0 ? token : null;
}

export async function setStoredPushToken(token) {
  if (!token) {
    await storageDelete(PUSH_TOKEN_KEY);
    return;
  }
  await storageSet(PUSH_TOKEN_KEY, token);
}
