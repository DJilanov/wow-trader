import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { renderHealingMetricsSources } from "./healing-metrics-model.mjs";
import { boundHealingAccountingPrecision } from "./healing-accounting-precision.mjs";

const bytes = readFileSync(
  new URL("./fixtures/healing-metrics-source.v1.json.gz", import.meta.url),
);
const sha = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(bytes), "f0d19cfc6c03545ac49648f3c07637c8f9ee2e79ecd2eaee34abe6b857252ff7");
const fixture = JSON.parse(gunzipSync(bytes).toString("utf8"));
const sources = Object.fromEntries(
  Object.entries(fixture.sources).map(([name, entry]) => {
    assert.equal(sha(entry.source), entry.byteSha256);
    return [name, entry.source];
  }),
);

test("healing precision derives reproducibly without changing the preserved foundation", () => {
  const baseline = renderHealingMetricsSources(sources).delivery;
  const derived = boundHealingAccountingPrecision(baseline);
  assert.notEqual(derived, baseline);
  assert.equal(derived, boundHealingAccountingPrecision(baseline));
  assert(derived.includes("min(result.Damage, max(0, result.Target.CurrentHealth() - before))"));
  assert.throws(() => boundHealingAccountingPrecision(derived), /anchor changed/);
  assert.equal(baseline, renderHealingMetricsSources(sources).delivery);
});
