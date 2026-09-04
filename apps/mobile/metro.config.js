const os = require("os");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const previousBlockList = config.resolver.blockList;
const previousPatterns = Array.isArray(previousBlockList)
  ? previousBlockList
  : previousBlockList
    ? [previousBlockList]
    : [];

// Ignore native build output so Windows does not hit EMFILE (Expo CLI disconnect).
config.resolver.blockList = [
  ...previousPatterns,
  /[\\/]android[\\/](?:.*[\\/])?build[\\/].*/,
];

config.maxWorkers = Math.max(2, Math.min(4, os.cpus().length - 1));

module.exports = withNativeWind(config, { input: "./global.css" });
