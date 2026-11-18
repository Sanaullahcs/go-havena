/** True only when the OS reports the device has no usable internet. */
export function isDeviceOfflineSnapshot(state) {
  if (!state) return false;
  if (state.isConnected === false) return true;
  if (state.isConnected === true && state.isInternetReachable === false) return true;
  return false;
}
