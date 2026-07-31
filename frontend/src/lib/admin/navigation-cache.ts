/** Short-lived in-memory cache so admin sidebar navigation feels instant. */

type CacheEntry = { at: number; value: unknown };

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60_000;

export function getAdminCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttlMs) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function setAdminCache(key: string, value: unknown) {
  store.set(key, { at: Date.now(), value });
}

export function invalidateAdminCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
