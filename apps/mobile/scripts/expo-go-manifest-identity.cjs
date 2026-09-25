/**
 * Unique Expo Go update identity on every manifest request.
 *
 * Expo Go INSERTs each QR/open into updates with UNIQUE(scope_key, commit_time).
 * Reusing id/createdAt (or minting two manifests in the same second) makes the
 * second INSERT crash the app. Every call therefore mints a new UUID and a
 * commit_time strictly later than the last one we issued.
 *
 * Writes only .expo/havena-go-manifest-identity.json — never Havena app data.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATE_FILE = "havena-go-manifest-identity.json";
/** Beat SQLite/second-precision commit_time and parallel Metro workers. */
const MIN_STEP_MS = 2000;

function statePath(projectRoot) {
  return path.join(projectRoot, ".expo", STATE_FILE);
}

function lockPath(projectRoot) {
  return `${statePath(projectRoot)}.lock`;
}

function readState(projectRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(projectRoot), "utf8"));
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // First run or unreadable file — start a new identity.
  }
  return null;
}

function writeState(projectRoot, state) {
  const dest = statePath(projectRoot);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(state, null, 2)}\n`);
}

function withLock(projectRoot, fn) {
  const dest = lockPath(projectRoot);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  let fd;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      fd = fs.openSync(dest, "wx");
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const waitUntil = Date.now() + 20;
      while (Date.now() < waitUntil) {
        // Another Metro worker is minting — wait, then issue a later commit_time.
      }
    }
  }

  if (fd == null) {
    throw new Error("expo-go-manifest-identity: could not lock identity file");
  }

  try {
    return fn();
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // Lock fd already closed.
    }
    try {
      fs.unlinkSync(dest);
    } catch {
      // Lock already released.
    }
  }
}

function mintIdentity(projectRoot) {
  const prev = readState(projectRoot);
  const prevMs = Number(prev?.commitMs) || 0;
  const commitMs = Math.max(Date.now() + MIN_STEP_MS, prevMs + MIN_STEP_MS);
  const state = {
    session: String(process.env.HAVENA_GO_SESSION || "").trim() || null,
    slug: String(process.env.HAVENA_GO_SLUG || "").trim() || null,
    pid: process.pid,
    id: crypto.randomUUID(),
    commitMs,
    createdAt: new Date(commitMs).toISOString(),
  };
  writeState(projectRoot, state);
  return { id: state.id, createdAt: state.createdAt, commitMs: state.commitMs };
}

function identity(projectRoot) {
  if (!projectRoot) {
    throw new Error("expo-go-manifest-identity: projectRoot is required");
  }

  return withLock(projectRoot, () => mintIdentity(projectRoot));
}

module.exports = {
  STATE_FILE,
  MIN_STEP_MS,
  identity,
  readState,
  statePath,
};
