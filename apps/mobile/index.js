/**
 * App entry — install text clip fixes before Expo Router boots.
 * Uses require() so order is guaranteed (ESM import hoisting would run entry first).
 */
// Register Expo Go native modules (incl. ExpoAsset) before router entry.
require("expo");
require("./utils/arabic-text-metrics").installTextClipFixes();
require("./utils/apply-default-font").applyDefaultBrandFont();
require("expo-router/entry");
