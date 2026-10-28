import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    "artifact-root": { type: "string" },
    "evidence-dir": { type: "string" },
    "verify-cache": { type: "boolean", default: false },
  },
});
const runtime = resolve(
  values["artifact-root"] ??
    process.env.FOREVER_SIMULATOR_ROOT ??
    join(root, "artifacts/forever-simulator"),
);
const evidence = resolve(
  values["evidence-dir"] ?? join(root, "artifacts/forever-simulator/optimization/tier-comparison"),
);
await mkdir(evidence, { recursive: true });
const run = await mkdtemp(join(evidence, "inputs-")),
  input = join(run, "inputs.json");
async function command(binary, args, cwd = root) {
  await new Promise((resolveDone, reject) => {
    const child = spawn(binary, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      try {
        assert.equal(signal, null);
        assert.equal(code, 0);
        resolveDone();
      } catch (error) {
        reject(error);
      }
    });
  });
}
await command(
  "pnpm",
  [
    "exec",
    "tsx",
    join(root, "scripts/prepare-current-tier-inputs.ts"),
    "--artifact-root=" + runtime,
    "--output=" + input,
  ],
  join(root, "apps/web"),
);
await command(process.execPath, [
  join(root, "scripts/benchmark-current-tier-lists.mjs"),
  "--inputs=" + input,
  "--output=" + evidence,
  "--write-snapshots",
  ...(values["verify-cache"] ? ["--verify-cache"] : []),
]);
