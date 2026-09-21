import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getUser } from "./auth-session";

const STORAGE_PREFIX = "nbr_saved_notices";

function storageKey(userId) {
  return userId ? `${STORAGE_PREFIX}_${userId}` : STORAGE_PREFIX;
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

function parseIds(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return [];
  }
}

export async function getSavedNoticeIds() {
  const user = await getUser();
  const raw = await storageGet(storageKey(user?.id));
  return parseIds(raw);
}

export async function setSavedNoticeIds(ids) {
  const user = await getUser();
  const unique = Array.from(new Set(ids.map((id) => Number(id)).filter((id) => id > 0)));
  await storageSet(storageKey(user?.id), JSON.stringify(unique));
  return unique;
}

export async function toggleSavedNotice(id) {
  const noticeId = Number(id);
  if (!Number.isFinite(noticeId) || noticeId <= 0) {
    return { saved: false, ids: [] };
  }

  const current = await getSavedNoticeIds();
  const saved = current.includes(noticeId);
  const next = saved ? current.filter((item) => item !== noticeId) : [...current, noticeId];
  const ids = await setSavedNoticeIds(next);
  return { saved: !saved, ids };
}
