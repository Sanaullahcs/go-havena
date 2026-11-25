import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Survives logout. One entry per account, not per session. */
const SEEN_KEY = "havena_product_welcome_seen";

function accountKey(user) {
  if (user?.id != null && user.id !== "") return `id:${user.id}`;
  const email = String(user?.email ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = String(user?.phone ?? "").trim();
  if (phone) return `phone:${phone}`;
  return null;
}

async function readSeen() {
  try {
    const raw = Platform.OS === "web"
      ? (typeof localStorage !== "undefined" ? localStorage.getItem(SEEN_KEY) : null)
      : await SecureStore.getItemAsync(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function writeSeen(keys) {
  const value = JSON.stringify(keys);
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.setItem(SEEN_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(SEEN_KEY, value);
}

export async function hasSeenProductWelcome(user) {
  const key = accountKey(user);
  if (!key) return false;
  const seen = await readSeen();
  return seen.includes(key);
}

export async function markProductWelcomeSeen(user) {
  const key = accountKey(user);
  if (!key) return;
  const seen = await readSeen();
  if (seen.includes(key)) return;
  seen.push(key);
  await writeSeen(seen);
}
