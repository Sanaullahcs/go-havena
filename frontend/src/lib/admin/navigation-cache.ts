/** Short-lived cache so admin navigation and refresh feel instant. */

type CacheEntry = { at: number; value: unknown };

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60_000;
const SS_PREFIX = "havena-admin-cache:";

function readSession(key: string, ttlMs: number): CacheEntry | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed || typeof parsed.at !== "number") return undefined;
    if (Date.now() - parsed.at > ttlMs) {
      sessionStorage.removeItem(SS_PREFIX + key);
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function writeSession(key: string, entry: CacheEntry) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota or private mode — memory cache still works.
  }
}

export function getAdminCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | undefined {
  const hit = store.get(key);
  if (hit) {
    if (Date.now() - hit.at > ttlMs) {
      store.delete(key);
    } else {
      return hit.value as T;
    }
  }

  const persisted = readSession(key, ttlMs);
  if (!persisted) return undefined;
  store.set(key, persisted);
  return persisted.value as T;
}

export function setAdminCache(key: string, value: unknown) {
  const entry = { at: Date.now(), value };
  store.set(key, entry);
  writeSession(key, entry);
}

export function invalidateAdminCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    if (typeof window !== "undefined") {
      const keys = Object.keys(sessionStorage).filter((k) => k.startsWith(SS_PREFIX));
      keys.forEach((k) => sessionStorage.removeItem(k));
    }
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  if (typeof window !== "undefined") {
    const keys = Object.keys(sessionStorage).filter(
      (k) => k.startsWith(SS_PREFIX) && k.slice(SS_PREFIX.length).startsWith(prefix),
    );
    keys.forEach((k) => sessionStorage.removeItem(k));
  }
}
