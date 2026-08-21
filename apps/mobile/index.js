/**
 * App entry — install text clip fixes before Expo Router boots.
 * Uses require() so order is guaranteed (ESM import hoisting would run entry first).
 */
require("./utils/arabic-text-metrics").installTextClipFixes();
require("expo-router/entry");
