/** True while the search box value hasn't caught up to the debounced query yet. */
export function isAdminSearchPending(searchInput: string, debouncedSearch: string) {
  return searchInput.trim() !== debouncedSearch.trim();
}

/** Combined busy flag for admin DataTable overlays (fetch / row actions — not search debounce). */
export function adminTableBusy(
  ...flags: Array<boolean | null | undefined>
): boolean {
  return flags.some(Boolean);
}

/** Client-side admin tables: transitions, deferred filter updates, and search debounce. */
export function adminClientTableBusy(
  isPending: boolean,
  isDeferredPending: boolean,
  searchInput: string,
  debouncedSearch: string,
  ...fetchFlags: Array<boolean | null | undefined>
): boolean {
  return adminTableBusy(
    isPending,
    isDeferredPending,
    isAdminSearchPending(searchInput, debouncedSearch),
    ...fetchFlags,
  );
}

/**
 * Avoid double-fetching when a filter/search change also resets pagination.
 * Call from an effect that depends on `[filterKey, page, load]`.
 * Returns true when the caller should skip this run (page reset pending).
 */
export function shouldSkipStalePageFetch(
  filterKey: string,
  page: number,
  setPage: (page: number) => void,
  prevFilterKeyRef: { current: string },
): boolean {
  if (prevFilterKeyRef.current !== filterKey) {
    prevFilterKeyRef.current = filterKey;
    if (page !== 1) {
      setPage(1);
      return true;
    }
  }
  return false;
}
