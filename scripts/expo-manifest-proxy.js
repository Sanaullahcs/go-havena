#!/usr/bin/env node
/**
 * Forward Metro (:8081) and inject Expo-Platform on manifest routes.
 * Expo Go / iOS Camera often fetch "/" without that header; Metro then
 * returns the web HTML page and Expo Go fails with
 * "Failed to parse manifest JSON".
 */
const http = require("http");
const net = require("net");

const LISTEN_PORT = Number(process.env.EXPO_PROXY_PORT || 8082);
const TARGET_HOST = process.env.EXPO_PROXY_TARGET_HOST || "127.0.0.1";
const TARGET_PORT = Number(process.env.EXPO_PROXY_TARGET_PORT || 8081);

function isManifestPath(url) {
  const path = String(url || "/").split("?")[0];
  return path === "/" || path === "/manifest" || path === "/index.exp";
}

function guessPlatform(req) {
  const existing = req.headers["expo-platform"] || req.headers["exponent-platform"];
  if (existing) return String(existing).toLowerCase();
  const ua = String(req.headers["user-agent"] || "");
  if (/android/i.test(ua)) return "android";
  return "ios";
}

function rewriteManifestRequest(req) {
  if (!isManifestPath(req.url)) return;
  if (!req.headers["expo-platform"] && !req.headers["exponent-platform"]) {
    req.headers["expo-platform"] = guessPlatform(req);
  }
  const accept = String(req.headers.accept || "");
  if (!accept || accept === "*/*" || accept.includes("text/html")) {
    req.headers.accept = "application/expo+json, application/json";
  }
}

const server = http.createServer((req, res) => {
  rewriteManifestRequest(req);
  const proxy = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (upstream) => {
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
    },
  );
  proxy.on("error", (err) => {
    res.statusCode = 502;
    res.end(`expo-manifest-proxy: ${err.message}`);
  });
  req.pipe(proxy);
});

server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const headerLines = Object.entries(req.headers)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join("\r\n");
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headerLines}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  console.log(`[expo-manifest-proxy] :${LISTEN_PORT} → ${TARGET_HOST}:${TARGET_PORT}`);
});
