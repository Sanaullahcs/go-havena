function routeName(value) {
  return String(value ?? "").toLowerCase();
}

function isAdminStackRoute(name) {
  const n = routeName(name);
  return (
    n.includes("admin-") ||
    n.includes("admin-dashboard") ||
    n.includes("create-notice") ||
    n.includes("create-event") ||
    n.includes("create-alert") ||
    n.includes("create-post") ||
    n.includes("property-management") ||
    n.includes("invite-guest-admin") ||
    n.includes("resident-features")
  );
}

function isResidentOrAuthRoute(name) {
  const n = routeName(name);
  if (!n) return false;
  if (isAdminStackRoute(n)) return false;
  return (
    n === "(tabs)" ||
    n.includes("(tabs)") ||
    n === "index" ||
    n === "home" ||
    n.includes("screens/login") ||
    n.includes("signup") ||
    n.includes("roles")
  );
}

/** Screens opened from both resident home and admin hub — always pop the stack when possible. */
function isSharedScreenRoute(name) {
  const n = routeName(name);
  return (
    n.includes("notification") ||
    n.includes("screens/settings") ||
    n.includes("screens/messages")
  );
}

/**
 * Decide Back without throwing or leaving Community Admin Mode on admin-only screens.
 * previousRouteName empty means we could not inspect the stack.
 */
function resolveBackAction({ canGoBack, previousRouteName, currentRouteName, isAdminMode }) {
  const prev = routeName(previousRouteName);
  const current = routeName(currentRouteName);

  if (isSharedScreenRoute(current) && canGoBack) {
    return { type: "back" };
  }

  if (canGoBack) return { type: "back" };

  if (isAdminMode) {
    if (current.includes("admin-dashboard")) {
      return { type: "replace", path: "/(tabs)/home" };
    }
    if (prev && isResidentOrAuthRoute(prev)) {
      return { type: "replace", path: "/screens/admin-dashboard" };
    }
    return { type: "replace", path: "/screens/admin-dashboard" };
  }

  return { type: "replace", path: "/(tabs)/home" };
}

function previousRouteNameFromState(state) {
  const routes = state?.routes;
  if (!Array.isArray(routes) || routes.length === 0) return "";
  const index = Number.isInteger(state.index) ? state.index : routes.length - 1;
  const prev = routes[index - 1];
  return prev?.name ?? "";
}

function currentRouteNameFromState(state) {
  const routes = state?.routes;
  if (!Array.isArray(routes) || routes.length === 0) return "";
  const index = Number.isInteger(state.index) ? state.index : routes.length - 1;
  return routes[index]?.name ?? "";
}

const modeBack = {
  isAdminStackRoute,
  isResidentOrAuthRoute,
  isSharedScreenRoute,
  resolveBackAction,
  previousRouteNameFromState,
  currentRouteNameFromState,
};

module.exports = modeBack;
module.exports.default = modeBack;
