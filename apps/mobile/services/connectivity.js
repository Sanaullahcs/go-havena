import * as Network from "expo-network";
import { isDeviceOfflineSnapshot } from "../utils/connectivity-state";

let snapshot = { isConnected: null, isInternetReachable: null };
const listeners = new Set();
let subscription = null;

function emit(meta) {
  listeners.forEach((listener) => {
    try {
      listener(snapshot, meta);
    } catch {
      // A listener must not break connectivity updates.
    }
  });
}

function apply(state) {
  const wasOffline = isDeviceOfflineSnapshot(snapshot);
  snapshot = {
    isConnected: state?.isConnected ?? null,
    isInternetReachable: state?.isInternetReachable ?? null,
  };
  emit(wasOffline && !isDeviceOfflineSnapshot(snapshot) ? { restored: true } : undefined);
}

export function startConnectivityWatch() {
  if (!subscription) {
    try {
      subscription = Network.addNetworkStateListener((state) => apply(state));
    } catch {
      subscription = null;
    }
  }
  void refreshConnectivity();
  return () => {
    subscription?.remove?.();
    subscription = null;
  };
}

export async function refreshConnectivity() {
  try {
    apply(await Network.getNetworkStateAsync());
  } catch {
    // Unknown connectivity is not treated as offline.
  }
  return snapshot;
}

export async function isDeviceOffline() {
  await refreshConnectivity();
  return isDeviceOfflineSnapshot(snapshot);
}

export function subscribeConnectivity(listener) {
  listeners.add(listener);
  startConnectivityWatch();
  return () => listeners.delete(listener);
}
