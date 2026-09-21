/**
 * Patch Expo CLI's Expo Go manifest handler so id + createdAt stay stable
 * for one Metro process (see expo-go-manifest-identity.cjs).
 *
 * Idempotent. Safe to run from postinstall and before `expo start`.
 */
const fs = require("fs");
const path = require("path");

const MARKER = "HAVENA_STABLE_EXPO_GO_MANIFEST";
const NEEDLE = `        const expoUpdatesManifest = {
            id: _crypto().default.randomUUID(),
            createdAt: new Date().toISOString(),`;
const REPLACEMENT = `        const __havenaGoIdentity = require(require("path").join(this.projectRoot, "scripts/expo-go-manifest-identity.cjs")).identity(this.projectRoot);
        const expoUpdatesManifest = {
            // ${MARKER}
            id: __havenaGoIdentity.id,
            createdAt: __havenaGoIdentity.createdAt,`;

function findMiddlewareFiles(root) {
  const rel = path.join(
    "node_modules",
    "expo",
    "node_modules",
    "@expo",
    "cli",
    "build",
    "src",
    "start",
    "server",
    "middleware",
    "ExpoGoManifestHandlerMiddleware.js",
  );
  const hoisted = path.join(
    "node_modules",
    "@expo",
    "cli",
    "build",
    "src",
    "start",
    "server",
    "middleware",
    "ExpoGoManifestHandlerMiddleware.js",
  );
  return [path.join(root, rel), path.join(root, hoisted)].filter((file) => fs.existsSync(file));
}

function patchFile(file) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(MARKER)) {
    return "already-patched";
  }
  if (!source.includes(NEEDLE)) {
    return "unexpected-source";
  }
  fs.writeFileSync(file, source.replace(NEEDLE, REPLACEMENT));
  return "patched";
}

function main() {
  const root = path.resolve(__dirname, "..");
  const files = findMiddlewareFiles(root);
  if (files.length === 0) {
    console.warn("[havena] Expo Go manifest middleware not found; skip patch.");
    return;
  }
  for (const file of files) {
    const result = patchFile(file);
    if (result === "unexpected-source") {
      throw new Error(`[havena] Expo Go manifest handler changed; update scripts/patch-expo-go-manifest.cjs (${file})`);
    }
    console.log(`[havena] Expo Go manifest ${result}: ${path.relative(root, file)}`);
  }
}

main();
