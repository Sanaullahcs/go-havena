/**
 * Patch Expo Go manifest handling, mint a new update identity for this
 * Metro session, then start Expo with that session env.
 */
const { spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");

require("./expo-ws-polyfill.cjs");

require("./patch-expo-go-manifest.cjs");
require("./patch-expo-go-reload.cjs");
const { identity } = require("./expo-go-manifest-identity.cjs");

const projectRoot = path.resolve(__dirname, "..");
const session = String(process.env.HAVENA_GO_SESSION || "").trim() || crypto.randomUUID();
const slug = String(process.env.HAVENA_GO_SLUG || "").trim()
  || `havena-go-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
process.env.HAVENA_GO_SESSION = session;
process.env.HAVENA_GO_SLUG = slug;
identity(projectRoot);

const args = process.argv.slice(2);
const expoCli = path.join(projectRoot, "node_modules", "expo", "bin", "cli");
const wsPolyfill = path.join(__dirname, "expo-ws-polyfill.cjs");
const nodeOptions = [process.env.NODE_OPTIONS, `-r ${wsPolyfill}`].filter(Boolean).join(" ").trim();
const daemon = process.env.HAVENA_EXPO_DAEMON === "1";
const child = spawn(process.execPath, [expoCli, ...args], {
  cwd: projectRoot,
  stdio: daemon ? ["ignore", "pipe", "pipe"] : "inherit",
  detached: daemon,
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    HAVENA_GO_SESSION: session,
    HAVENA_GO_SLUG: slug,
    HAVENA_LOCAL_EXPO: "1",
    EXPO_NO_UPDATES: process.env.EXPO_NO_UPDATES || "1",
  },
});

if (daemon) {
  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  child.unref();
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) process.exit(code);
  });
  return;
}

child.on("error", (error) => {
  console.error("[havena] Could not start Expo CLI:", error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
