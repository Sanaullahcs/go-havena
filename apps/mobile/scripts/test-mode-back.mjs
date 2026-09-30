import assert from "node:assert/strict";
import modeBack from "../utils/mode-back.cjs";

const { resolveBackAction } = modeBack;

assert.deepEqual(
  resolveBackAction({
    canGoBack: true,
    previousRouteName: "(tabs)/home",
    currentRouteName: "screens/notification/index",
    isAdminMode: true,
  }),
  { type: "back" },
);

assert.deepEqual(
  resolveBackAction({
    canGoBack: false,
    previousRouteName: "",
    currentRouteName: "screens/admin-dashboard/index",
    isAdminMode: true,
  }),
  { type: "replace", path: "/(tabs)/home" },
);

assert.deepEqual(
  resolveBackAction({
    canGoBack: true,
    previousRouteName: "screens/admin-dashboard/index",
    currentRouteName: "screens/admin-members/index",
    isAdminMode: true,
  }),
  { type: "back" },
);

console.log("test-mode-back: ok");
