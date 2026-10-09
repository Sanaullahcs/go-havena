/**
 * Put the latest page first, refresh rows the server already returned,
 * and keep older pages that were not in this response.
 */
export function syncLatestNotifications(existing, incoming) {
  const seen = new Set();
  const merged = [];

  for (const item of incoming ?? []) {
    if (item?.id == null || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }

  for (const item of existing ?? []) {
    if (item?.id == null || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }

  return merged;
}

/** Append paginated notification rows without duplicates (stable order). */
export function mergeNotifications(existing, incoming) {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      merged.push(item);
      seen.add(item.id);
    }
  }
  return merged;
}
