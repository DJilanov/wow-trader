import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";

export const workspaceLeaseVariable = "KFC_SIMULATOR_WORKSPACE_LEASE";

export async function assertSimulatorWorkspaceAccess(root, environment = process.env) {
  let owner;
  try {
    owner = JSON.parse(
      await readFile(
        join(root, "artifacts/forever-simulator/optimization/feedback-sessions/active.lock"),
        "utf8",
      ),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    assert(!environment[workspaceLeaseVariable], "Inherited simulator lease no longer exists");
    return null;
  }
  assert(
    Number.isSafeInteger(owner.pid) &&
      owner.pid > 0 &&
      typeof owner.nonce === "string" &&
      typeof owner.statePath === "string",
    "Invalid simulator workspace lock",
  );
  if (owner.pid === process.pid && !environment[workspaceLeaseVariable]) return owner;
  assert(
    environment[workspaceLeaseVariable],
    `Simulator workspace is reserved by PID ${owner.pid}; finish or stop that run first. A lock alone is not proof of liveness.`,
  );
  assert.deepEqual(
    JSON.parse(environment[workspaceLeaseVariable]),
    owner,
    "Simulator workspace lease belongs to a different run",
  );
  process.kill(owner.pid, 0);
  return owner;
}

export async function acquireSimulatorWorkspace(root, statePath, environment = process.env) {
  if (environment[workspaceLeaseVariable]) {
    const owner = await assertSimulatorWorkspaceAccess(root, environment);
    return { environment: { ...environment }, owner, release: async () => {} };
  }
  const path = join(root, "artifacts/forever-simulator/optimization/feedback-sessions/active.lock");
  await mkdir(dirname(path), { recursive: true });
  const owner = { pid: process.pid, nonce: randomUUID(), statePath };
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    await assertSimulatorWorkspaceAccess(root, environment);
    throw new Error("Simulator workspace is reserved by this process; reuse its lease environment");
  }
  try {
    await handle.writeFile(JSON.stringify(owner));
  } catch (error) {
    const opened = await handle.stat();
    const current = await stat(path);
    assert(
      opened.dev === current.dev && opened.ino === current.ino,
      "Simulator lock changed during initialization",
    );
    await unlink(path);
    throw error;
  } finally {
    await handle.close();
  }
  let released = false;
  return {
    owner,
    environment: { ...environment, [workspaceLeaseVariable]: JSON.stringify(owner) },
    async release() {
      if (released) return;
      const current = JSON.parse(await readFile(path, "utf8"));
      assert.deepEqual(current, owner, "Refusing to release another simulator run's lock");
      await unlink(path);
      released = true;
    },
  };
}
