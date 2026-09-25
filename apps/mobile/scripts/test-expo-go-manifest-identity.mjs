/**
 * Covers Expo Go update identity: every manifest must get a new id and a
 * later commit_time so UNIQUE(scope_key, commit_time) cannot fire.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const identityPath = join(import.meta.dirname, "expo-go-manifest-identity.cjs");
const { identity, MIN_STEP_MS, readState } = require(identityPath);

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function childIdentity(projectRoot, extraEnv = {}) {
  const script = `
    const { identity } = require(${JSON.stringify(identityPath)});
    process.stdout.write(JSON.stringify(identity(${JSON.stringify(projectRoot)})));
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "child identity failed");
  }
  return JSON.parse(result.stdout);
}

const root = mkdtempSync(join(tmpdir(), "havena-go-identity-"));

try {
  const first = identity(root);
  const second = identity(root);
  assert(second.id !== first.id, "rescan must mint a new update id");
  assert(second.commitMs >= first.commitMs + MIN_STEP_MS, "rescan commit_time must be strictly later");
  assert(second.createdAt !== first.createdAt, "rescan createdAt must differ");

  const worker = childIdentity(root, { HAVENA_GO_SESSION: "havena-go-session-test" });
  assert(worker.id !== second.id, "parallel Metro worker must mint a new update id");
  assert(worker.commitMs >= second.commitMs + MIN_STEP_MS, "worker commit_time must be strictly later");

  const restarted = childIdentity(root, { HAVENA_GO_SESSION: "havena-go-session-restart" });
  assert(restarted.id !== first.id, "Metro restart must mint a new update id");
  assert(restarted.commitMs >= worker.commitMs + MIN_STEP_MS, "restart commit_time must be strictly later");

  const freshRoot = mkdtempSync(join(tmpdir(), "havena-go-identity-fresh-"));
  try {
    const fresh = childIdentity(freshRoot);
    assert(fresh.id !== first.id, "fresh install must not reuse another device id");
    assert(typeof fresh.createdAt === "string", "fresh install must have createdAt");
  } finally {
    rmSync(freshRoot, { recursive: true, force: true });
  }

  const ota = childIdentity(root);
  assert(ota.id !== restarted.id, "new OTA identity must use a new update id");
  assert(ota.commitMs >= restarted.commitMs + MIN_STEP_MS, "new OTA commit_time must not collide");
  assert(ota.createdAt !== restarted.createdAt, "new OTA createdAt must differ");

  const state = readState(root);
  assert(state.commitMs === ota.commitMs, "persisted metadata must match last issued identity");

  console.log("expo-go-manifest-identity: unique id + later commit_time on every request — ok");
} finally {
  rmSync(root, { recursive: true, force: true });
}
