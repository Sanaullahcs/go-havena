import { getCachedUser } from "../services/auth-session";
import { isCommunityAdmin } from "../services/community-access";
import modeBack from "./mode-back.cjs";

const { currentRouteNameFromState, previousRouteNameFromState, resolveBackAction } = modeBack;

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

/** Back that never throws and never leaves Community Admin Mode for a leftover Resident route. */
export function safeGoBack(router, navigation) {
  if (!router) return;

  const state = navigation?.getState?.() ?? null;
  const action = resolveBackAction({
    canGoBack: Boolean(router.canGoBack?.()),
    previousRouteName: previousRouteNameFromState(state),
    currentRouteName: currentRouteNameFromState(state),
    isAdminMode: isCommunityAdmin(getCachedUser()),
  });

  try {
    if (action.type === "back") {
      router.back();
      return;
    }
    if (action.type === "replace" && action.path) {
      router.replace(action.path);
    }
  } catch {
    try {
      if (isCommunityAdmin(getCachedUser())) {
        router.replace("/screens/admin-dashboard");
      }
    } catch {
      // Stay on the current screen rather than crash.
    }
  }
}
