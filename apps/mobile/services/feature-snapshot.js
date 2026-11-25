import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "nbr_feature_snapshot";

let memory = null;
let hydratePromise = null;

export function getMemoryFeatureSnapshot() {
  return memory;
}

export async function hydrateFeatureSnapshot() {
  if (memory) return memory;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const raw = Platform.OS === "web"
          ? (typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null)
          : await SecureStore.getItemAsync(KEY);
        if (raw) memory = JSON.parse(raw);
      } catch {
        memory = memory ?? null;
      }
      return memory;
    })();
  }
  return hydratePromise;
}

/** Persist the feature map returned by the API. This is the only copy used for visibility. */
export async function saveFeatureSnapshot(payload) {
  if (!payload || typeof payload.features !== "object" || payload.features == null) return memory;
  memory = {
    features: payload.features,
    pending_requests: Array.isArray(payload.pending_requests) ? payload.pending_requests : [],
    updatedAt: Date.now(),
  };
  const raw = JSON.stringify(memory);
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(KEY, raw);
    } else {
      await SecureStore.setItemAsync(KEY, raw);
    }
  } catch {
    // The in-memory snapshot is still the latest server payload.
  }
  return memory;
}

export function applySnapshotToUser(user, snapshot = memory) {
  if (!user || !snapshot?.features) return user;
  const currentAt = Number(user.resident_features?.updatedAt ?? 0);
  if (currentAt && snapshot.updatedAt && currentAt >= snapshot.updatedAt) return user;
  return {
    ...user,
    resident_features: {
      ...(user.resident_features ?? {}),
      features: snapshot.features,
      pending_requests: snapshot.pending_requests ?? [],
      updatedAt: snapshot.updatedAt,
    },
  };
}
