/**
 * Patch Expo Go manifest handling, mint a new update identity for this
 * Metro session, then start Expo with that session env.
 */
const { spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");

require("./patch-expo-go-manifest.cjs");
const { identity } = require("./expo-go-manifest-identity.cjs");

const projectRoot = path.resolve(__dirname, "..");
const session = String(process.env.HAVENA_GO_SESSION || "").trim() || crypto.randomUUID();
const slug = String(process.env.HAVENA_GO_SLUG || "").trim()
  || `havena-go-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
process.env.HAVENA_GO_SESSION = session;
process.env.HAVENA_GO_SLUG = slug;
identity(projectRoot);

const args = process.argv.slice(2);
const child = spawn("./node_modules/.bin/expo", args, {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    HAVENA_GO_SESSION: session,
    HAVENA_GO_SLUG: slug,
    EXPO_NO_UPDATES: process.env.EXPO_NO_UPDATES || "1",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
