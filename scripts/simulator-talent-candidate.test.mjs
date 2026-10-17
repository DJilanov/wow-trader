import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const script = resolve(root, "scripts/verify-simulator-talent-candidate.mjs");

test("talent-candidate verification rejects missing, duplicate and unsupported arguments before I/O", () => {
  for (const args of [
    [],
    ["--baseline=missing.json"],
    ["--baseline=missing.json", "--baseline=other.json"],
    ["--baseline=missing.json", "--talent-review=missing.json", "--rebuild=true"],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pass --baseline=<file> --talent-review=<file>/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});
