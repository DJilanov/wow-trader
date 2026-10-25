import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { simulationHash } from "./simulation-fingerprint.mjs";

test("fingerprints preserve the existing byte and JSON serialization identities", () => {
  for (const value of ["", "request", null, false, 0, { b: 2, a: 1 }, [1, { nested: true }]]) {
    const bytes = typeof value === "string" ? value : JSON.stringify(value);
    assert.equal(simulationHash(value), createHash("sha256").update(bytes).digest("hex"));
  }
  assert.notEqual(simulationHash({ a: 1, b: 2 }), simulationHash({ b: 2, a: 1 }));
});
