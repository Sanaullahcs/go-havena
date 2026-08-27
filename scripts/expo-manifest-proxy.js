#!/usr/bin/env node
/**
 * Forward Metro and always return a native JSON manifest for "/", "/manifest",
 * and "/index.exp".
 *
 * Without this, Camera / Expo Go often fetch without Expo-Platform (Metro then
 * serves the web HTML page) or with Accept: multipart/mixed (body is not JSON).
 * Both produce: "Failed to parse manifest JSON".
 *
 * Manifests are fetched with clean headers (not blindly forwarded) so a phone
 * User-Agent cannot flip Metro into HTML mode. The QR for HTTPS tunnels must
 * use exps:// — exp://host:443 is HTTP-on-443 and iOS then tries to parse TLS.
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

function log(line) {
  const stamp = new Date().toISOString();
  console.log(`[expo-manifest-proxy ${stamp}] ${line}`);
}

function fetchManifest(platform) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        path: "/",
        method: "GET",
        headers: {
          host: `${TARGET_HOST}:${TARGET_PORT}`,
          "expo-platform": platform,
          accept: "application/expo+json, application/json",
          "expo-protocol-version": "0",
          "expo-json-error": "true",
          connection: "close",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 502,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error("metro manifest timeout"));
    });
    req.end();
  });
}

async function serveManifest(req, res) {
  const platform = guessPlatform(req);
  try {
    const upstream = await fetchManifest(platform);
    const text = upstream.body.toString("utf8").trim();
    if (text.startsWith("<") || !text.startsWith("{")) {
      log(`manifest not json platform=${platform} status=${upstream.status} head=${text.slice(0, 80)}`);
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "metro returned a non-JSON manifest" }));
      return;
    }
    JSON.parse(text);
    const headers = {
      "content-type": "application/expo+json",
      "cache-control": "private, max-age=0, no-store",
      "expo-protocol-version": upstream.headers["expo-protocol-version"] || "0",
      "expo-sfv-version": upstream.headers["expo-sfv-version"] || "0",
    };
    log(`manifest ok platform=${platform} bytes=${upstream.body.length} ua=${req.headers["user-agent"] || "-"}`);
    res.writeHead(200, headers);
    res.end(text);
  } catch (err) {
    log(`manifest error ${err.message}`);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `expo-manifest-proxy: ${err.message}` }));
  }
}

function hopByHop() {
  return new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "http2-settings",
  ]);
}

function forward(req, res) {
  const skip = hopByHop();
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!skip.has(key.toLowerCase())) headers[key] = value;
  }
  headers.host = `${TARGET_HOST}:${TARGET_PORT}`;
  delete headers["expo-expect-signature"];

  const proxy = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (upstream) => {
      const out = {};
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (!skip.has(key.toLowerCase())) out[key] = value;
      }
      res.writeHead(upstream.statusCode || 502, out);
      upstream.pipe(res);
    },
  );
  proxy.on("error", (err) => {
    res.statusCode = 502;
    res.end(`expo-manifest-proxy: ${err.message}`);
  });
  req.pipe(proxy);
}

const server = http.createServer((req, res) => {
  if (isManifestPath(req.url)) {
    serveManifest(req, res);
    return;
  }
  log(`${req.method} ${req.url}`);
  forward(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const skip = hopByHop();
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const headerLines = Object.entries(req.headers)
      .filter(([key]) => !skip.has(key.toLowerCase()))
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .concat([`host: ${TARGET_HOST}:${TARGET_PORT}`])
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
  log(`:${LISTEN_PORT} → ${TARGET_HOST}:${TARGET_PORT}`);
});
