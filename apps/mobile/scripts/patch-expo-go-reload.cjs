/**
 * Expo Go SDK 58 on iOS drops native modules after DevSettings.reload()
 * (https://github.com/expo/expo/issues/52146). Fast Refresh full reloads
 * go through metro-runtime's location.reload(), which calls that API.
 * Prefer expo.reloadAppAsync(), which starts a fresh runtime.
 *
 * Idempotent. Safe to run from postinstall and before `expo start`.
 */
const fs = require("fs");
const path = require("path");

const MARKER = "HAVENA_EXPO_GO_RELOAD";
const TARGET = path.join(
  "node_modules",
  "@expo",
  "metro-runtime",
  "build",
  "location",
  "Location.native.js",
);

const NEEDLE = `                    if (process.env.NODE_ENV !== 'production') {
                        // NOTE: This does change how native fast refresh works. The upstream metro-runtime will check
                        // if \`location.reload\` exists before falling back on an implementation that is nearly identical to
                        // this. The main difference is that on iOS there is a "reason" message sent, but at the time of writing
                        // this, that message is unused (ref: \`RCTTriggerReloadCommandNotification\`).
                        const DevSettings = require('react-native').DevSettings;
                        return DevSettings.reload();
                    } else if (typeof globalThis.expo !== 'undefined' && 'reloadAppAsync' in globalThis.expo) {
                        // Expo SDK 51 and above.
                        globalThis.expo.reloadAppAsync('');
                    } else {
                        throw new DOMException(\`Cannot call "location.reload()".\`, 'NotSupportedError');
                    }`;

const REPLACEMENT = `                    // ${MARKER}: Expo Go 58 iOS DevSettings.reload() loses native modules.
                    if (typeof globalThis.expo !== 'undefined' && typeof globalThis.expo.reloadAppAsync === 'function') {
                        globalThis.expo.reloadAppAsync('Metro reload');
                        return;
                    }
                    if (process.env.NODE_ENV !== 'production') {
                        const DevSettings = require('react-native').DevSettings;
                        return DevSettings.reload();
                    }
                    throw new DOMException(\`Cannot call "location.reload()".\`, 'NotSupportedError');`;

function patchFile(file) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(MARKER)) return "already-patched";
  if (!source.includes(NEEDLE)) return "unexpected-source";
  fs.writeFileSync(file, source.replace(NEEDLE, REPLACEMENT));
  return "patched";
}

function main() {
  const root = path.resolve(__dirname, "..");
  const file = path.join(root, TARGET);
  if (!fs.existsSync(file)) {
    console.warn("[havena] metro-runtime reload file not found; skip patch.");
    return;
  }
  const result = patchFile(file);
  if (result === "unexpected-source") {
    console.warn(`[havena] metro-runtime reload handler changed; skip patch (${file})`);
    return;
  }
  console.log(`[havena] Expo Go reload ${result}: ${path.relative(root, file)}`);
}

main();
