/**
 * Navigate to app routes without breaking tab stacks.
 * Tab routes use navigate (cross-tab safe); stack screens use push.
 *
 * Note: dismissTo only works when the target is already in history —
 * using it for sibling tab switches (e.g. Home → Marketplace) silently fails.
 */
export function navigateAppRoute(router, route) {
  if (!router || route == null) return;

  const path = typeof route === "string" ? route : route?.pathname;
  if (!path) return;

  const isTabRoute =
    path.startsWith("/(tabs)/") ||
    path.startsWith("/tabs/") ||
    path === "/home" ||
    path === "/marketplace" ||
    path === "/services" ||
    path === "/profile" ||
    path === "/notices" ||
    path === "/wellness" ||
    path.startsWith("/marketplace/") ||
    path.startsWith("/services/") ||
    path.startsWith("/wellness/");

  if (isTabRoute) {
    router.navigate(route);
    return;
  }

  router.push(route);
}
