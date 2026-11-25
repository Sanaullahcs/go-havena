import { getCachedUser } from "../services/auth-session";
import { isCommunityAdmin } from "../services/community-access";
import modeBack from "./mode-back.cjs";

const {
  backContextFromNavigation,
  isAdminStackRoute,
  isSameDestination,
  resolveBackAction,
} = modeBack;

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
    path === "/community" ||
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

/**
 * Pop to the screen that opened this one.
 * Returns true when navigation was handled. Returns false when this screen
 * is already the root of its mode, so the system back button can leave the app.
 */
export function safeGoBack(router, navigation, { fallbackPath } = {}) {
  if (!router) return false;

  const fromStack = backContextFromNavigation(navigation);
  const isAdminMode = isCommunityAdmin(getCachedUser());
  const action = resolveBackAction({
    canGoBack: Boolean(router.canGoBack?.()),
    previousRouteName: fromStack.previousRouteName,
    currentRouteName: fromStack.currentRouteName,
    isAdminMode,
    fallbackPath,
  });

  try {
    // Only pop when the router itself can go back — parent-stack heuristics can
    // be true while router.back() still logs "GO_BACK was not handled".
    if (action.type === "back" && router.canGoBack?.()) {
      router.back();
      return true;
    }
    if (action.type === "stay") {
      return false;
    }
    const replacePath =
      (action.type === "replace" && action.path)
      || fallbackPath
      || (isAdminStackRoute(fromStack.currentRouteName) && isAdminMode
        ? "/screens/admin-dashboard"
        : "/(tabs)/home");
    if (replacePath && !isSameDestination(fromStack.currentRouteName, replacePath)) {
      router.replace(replacePath);
      return true;
    }
  } catch {
    try {
      const onAdminScreen = isAdminStackRoute(fromStack.currentRouteName);
      if (onAdminScreen && isAdminMode) {
        router.replace("/screens/admin-dashboard");
        return true;
      }
      if (fallbackPath) {
        router.replace(fallbackPath);
        return true;
      }
      router.replace("/(tabs)/home");
      return true;
    } catch {
      // Stay on the current screen rather than crash.
    }
  }

  return false;
}
