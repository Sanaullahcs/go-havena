import { useEffect, useState } from "react";
import { isDeviceOfflineSnapshot } from "../utils/connectivity-state";
import { refreshConnectivity, subscribeConnectivity } from "../services/connectivity";

/** Live device-level offline flag (not API reachability). */
export function useDeviceOffline() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    void refreshConnectivity().then((snap) => setOffline(isDeviceOfflineSnapshot(snap)));
    return subscribeConnectivity((snap) => setOffline(isDeviceOfflineSnapshot(snap)));
  }, []);

  return offline;
}

export async function recheckDeviceOnline() {
  const snap = await refreshConnectivity();
  return !isDeviceOfflineSnapshot(snap);
}