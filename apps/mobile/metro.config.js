const os = require("os");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const API_PORT = Number(process.env.EXPO_DEV_API_PORT || 8000);

function isDevApiPath(url) {
  const pathOnly = String(url || "/").split("?")[0];
  return pathOnly === "/api" || pathOnly.startsWith("/api/") || pathOnly === "/storage" || pathOnly.startsWith("/storage/");
}

function proxyDevApi(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${API_PORT}` };
  delete headers.connection;
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: API_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ message: "Local API is not reachable." }));
  });
  req.pipe(upstream);
}

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

const finalConfig = withNativeWind(config, { input: "./global.css" });
finalConfig.server = finalConfig.server || {};
const previousEnhance = finalConfig.server.enhanceMiddleware;
finalConfig.server.enhanceMiddleware = (middleware, server) => {
  const nextMiddleware = previousEnhance ? previousEnhance(middleware, server) : middleware;
  return (req, res, next) => {
    if (isDevApiPath(req.url)) {
      proxyDevApi(req, res);
      return;
    }
    return nextMiddleware(req, res, next);
  };
};

module.exports = finalConfig;
