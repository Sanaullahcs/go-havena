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

const messageUnreadListeners = new Set();

export function subscribeMessageUnreadRefresh(listener) {
  messageUnreadListeners.add(listener);
  return () => messageUnreadListeners.delete(listener);
}

export function emitMessageUnreadRefresh() {
  messageUnreadListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.warn("[messages] unread listener failed", err);
    }
  });
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
