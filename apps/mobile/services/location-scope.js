import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { normalizeRadius, DEFAULT_RADIUS_MILES } from "../constants/location-radius";

const STORAGE_KEY = "havena_location_radius_miles";

let activeRadiusMiles = DEFAULT_RADIUS_MILES;

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

export function getActiveRadiusMiles() {
  return activeRadiusMiles;
}

export function setActiveRadiusMiles(miles) {
  activeRadiusMiles = normalizeRadius(miles);
  return activeRadiusMiles;
}

export async function loadSavedRadiusMiles() {
  try {
    const raw = await storageGet(STORAGE_KEY);
    if (raw == null || raw === "") {
      activeRadiusMiles = DEFAULT_RADIUS_MILES;
    } else {
      activeRadiusMiles = normalizeRadius(raw);
    }
  } catch {
    activeRadiusMiles = DEFAULT_RADIUS_MILES;
  }
  return activeRadiusMiles;
}

export async function persistRadiusMiles(miles) {
  const next = setActiveRadiusMiles(miles);
  try {
    await storageSet(STORAGE_KEY, String(next));
  } catch {
    // Keep the in-memory value even if storage is unavailable.
  }
  return next;
}
