import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { boundHealingStatisticsPrecision } from "./healing-statistics-precision.mjs";

const bytes = readFileSync(
  new URL("./fixtures/healing-statistics-source.v1.json.gz", import.meta.url),
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(bytes), "8c2e150dec29552cb223e39c46d6f2ef5657b05c31a9254812250a6cd77d4eb9");
const fixture = JSON.parse(gunzipSync(bytes).toString("utf8"));
assert.equal(sha(fixture.source), fixture.byteSha256);

test("bounded variance correction derives from the authentic preserved aggregator", () => {
  assert.equal(fixture.schema, "kfc-healing-statistics-source-fixture.v1");
  const output = boundHealingStatisticsPrecision(fixture.source);
  assert.equal(output, boundHealingStatisticsPrecision(fixture.source));
  assert.notEqual(output, fixture.source);
  assert(output.includes("variance >= -roundingBound"));
  assert(output.includes("math.Sqrt(variance)"));
  assert.throws(() => boundHealingStatisticsPrecision(output), /anchor changed/);
});
