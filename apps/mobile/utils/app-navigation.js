import { getCachedUser } from "../services/auth-session";
import { isCommunityAdmin } from "../services/community-access";
import modeBack from "./mode-back.cjs";

const {
  backContextFromNavigation,
  isAdminStackRoute,
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
    canGoBack: fromStack.canGoBack || Boolean(router.canGoBack?.()),
    previousRouteName: fromStack.previousRouteName,
    currentRouteName: fromStack.currentRouteName,
    isAdminMode,
    fallbackPath,
  });

  try {
    if (action.type === "back") {
      router.back();
      return true;
    }
    if (action.type === "replace" && action.path) {
      router.replace(action.path);
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
