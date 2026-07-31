const refreshListeners = new Set();

export function subscribeNotificationRefresh(listener) {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

export function emitNotificationRefresh() {
  refreshListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.warn("[notifications] refresh listener failed", err);
    }
  });
}

const bannerListeners = new Set();

/** @param {(payload: { title: string, body: string, onPress?: () => void }) => void} listener */
export function subscribeNotificationBanner(listener) {
  bannerListeners.add(listener);
  return () => bannerListeners.delete(listener);
}

export function emitNotificationBanner(payload) {
  bannerListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (err) {
      console.warn("[notifications] banner listener failed", err);
    }
  });
}
