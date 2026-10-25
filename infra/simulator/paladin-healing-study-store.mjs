import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { link, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { simulationHash } from "./simulation-fingerprint.mjs";

/** Coalesce shared workload writes across workers, preserving existing evidence.
 * @param {string} directory
 * @returns {{save:(workload:object)=>Promise<{path:string,sha256:string,byteSha256:string}>,verify:()=>Promise<void>}}
 */
export function createPaladinHealingWorkloadStore(directory) {
  assert(isAbsolute(directory));
  const pending = new Map();
  function save(workload) {
    assert.equal(workload.schema, "kfc-paladin-healing-workload.v1");
    const snapshot = globalThis.structuredClone(workload),
      sha256 = simulationHash(snapshot);
    if (!pending.has(sha256))
      pending.set(
        sha256,
        (async () => {
          const path = join(directory, "workload-" + sha256 + ".json"),
            body = JSON.stringify(snapshot) + "\n";
          const pendingPath = path + "." + randomUUID() + ".pending";
          await writeFile(pendingPath, body, { flag: "wx", mode: 0o600 });
          try {
            try {
              await link(pendingPath, path);
            } catch (error) {
              if (error.code !== "EEXIST") throw error;
            }
          } finally {
            await unlink(pendingPath);
          }
          const bytes = await readFile(path),
            existing = JSON.parse(bytes);
          assert.equal(
            simulationHash(existing),
            sha256,
            "Shared healing workload evidence changed",
          );
          assert.deepEqual(existing, snapshot);
          return { path, sha256, byteSha256: createHash("sha256").update(bytes).digest("hex") };
        })(),
      );
    return pending.get(sha256);
  }
  return {
    save,
    verify: async () => {
      for (const promise of pending.values()) {
        const ref = await promise,
          bytes = await readFile(ref.path);
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          ref.byteSha256,
          "Shared healing workload bytes changed",
        );
        assert.equal(simulationHash(JSON.parse(bytes)), ref.sha256);
      }
    },
  };
}
