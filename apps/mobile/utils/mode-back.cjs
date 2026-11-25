function routeName(value) {
  return String(value ?? "").toLowerCase();
}

/** Community Admin stack screens only. Shared resident flows must not match. */
function isAdminStackRoute(name) {
  const n = routeName(name);
  if (!n) return false;
  return n.includes("admin-") || n.includes("invite-guest-admin");
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

function isSameDestination(currentRouteName, path) {
  const current = routeName(currentRouteName);
  const target = routeName(path);
  if (!current || !target) return false;
  if (target.includes("admin-dashboard") && current.includes("admin-dashboard")) return true;
  if (
    (target.includes("(tabs)/home") || target.endsWith("/home")) &&
    (current === "(tabs)" || current === "home" || current === "index" || current.includes("(tabs)"))
  ) {
    return true;
  }
  return false;
}

/**
 * Back follows the screen that opened this one.
 * Resident screens are never sent to Community Admin.
 * Admin screens pop inside the admin stack, and the dashboard pops back to
 * whatever opened it. A missing history falls back inside the current mode.
 */
function resolveBackAction({
  canGoBack,
  previousRouteName,
  currentRouteName,
  isAdminMode,
  fallbackPath,
}) {
  const current = routeName(currentRouteName);
  const onAdminScreen = isAdminStackRoute(current);

  if (canGoBack) return { type: "back" };

  if (onAdminScreen) {
    if (current.includes("admin-dashboard")) return { type: "stay" };
    if (isAdminMode) return { type: "replace", path: "/screens/admin-dashboard" };
  }

  const home = fallbackPath || "/(tabs)/home";
  if (isSameDestination(current, home)) return { type: "stay" };
  return { type: "replace", path: home };
}

function previousRouteNameFromState(state) {
  // Tab and drawer routes are siblings, not a back stack.
  if (state?.type === "tab" || state?.type === "drawer") return "";
  const routes = state?.routes;
  if (!Array.isArray(routes) || routes.length === 0) return "";
  const index = Number.isInteger(state.index) ? state.index : routes.length - 1;
  if (index <= 0) return "";
  const prev = routes[index - 1];
  return prev?.name ?? "";
}

function currentRouteNameFromState(state) {
  const routes = state?.routes;
  if (!Array.isArray(routes) || routes.length === 0) return "";
  const index = Number.isInteger(state.index) ? state.index : routes.length - 1;
  return routes[index]?.name ?? "";
}

/**
 * The navigator Back will actually pop. Nested stacks are preferred so a
 * drill-in returns to its parent before the root history is considered.
 */
function backContextFromNavigation(navigation) {
  let current = navigation ?? null;
  const seen = new Set();
  let leafName = "";

  while (current && !seen.has(current)) {
    seen.add(current);
    const state = typeof current.getState === "function" ? current.getState() : null;
    const currentRouteName = currentRouteNameFromState(state);
    if (!leafName && currentRouteName) leafName = currentRouteName;
    const previousRouteName = previousRouteNameFromState(state);
    if (previousRouteName) {
      return {
        canGoBack: true,
        previousRouteName,
        currentRouteName: leafName || currentRouteName,
      };
    }
    current = typeof current.getParent === "function" ? current.getParent() : null;
  }

  return {
    canGoBack: false,
    previousRouteName: "",
    currentRouteName: leafName,
  };
}

const modeBack = {
  isAdminStackRoute,
  isResidentOrAuthRoute,
  isSameDestination,
  resolveBackAction,
  previousRouteNameFromState,
  currentRouteNameFromState,
  backContextFromNavigation,
};

module.exports = modeBack;
module.exports.default = modeBack;
