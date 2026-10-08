const os = require("os");
const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Windows throws EMFILE from fs.promises, which graceful-fs does not cover.
function retryOnTooManyFiles(fn) {
  return async function retryingFsCall(...args) {
    let lastError;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        lastError = error;
        if (!error || (error.code !== "EMFILE" && error.code !== "ENFILE")) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    throw lastError;
  };
}

fs.promises.readFile = retryOnTooManyFiles(fs.promises.readFile);
fs.promises.writeFile = retryOnTooManyFiles(fs.promises.writeFile);
fs.promises.open = retryOnTooManyFiles(fs.promises.open);

const config = getDefaultConfig(__dirname);

const previousBlockList = config.resolver.blockList;
const previousPatterns = Array.isArray(previousBlockList)
  ? previousBlockList
  : previousBlockList
    ? [previousBlockList]
    : [];

// Ignore only this app's native project trees. A broad /android/ block also hides
// expo-symbols/build/android, and Android bundling then fails to resolve.
function projectTree(folderName) {
  const root = path.join(__dirname, folderName);
  const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped + "[\\\\/]");
}

config.resolver.blockList = [
  ...previousPatterns,
  projectTree("android"),
  projectTree("ios"),
];

// Keep Windows transforms small enough that a phone request is not stuck behind a pile of bundles.
config.maxWorkers = process.platform === "win32" ? 2 : Math.max(2, Math.min(4, os.cpus().length - 1));

module.exports = withNativeWind(config, { input: "./global.css" });
