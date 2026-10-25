import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { canonicalizeHealingActionMetrics } from "./healing-action-metrics-comparison.mjs";
const fixture = JSON.parse(
  gunzipSync(
    await readFile(new URL("./fixtures/healing-action-order-control.v1.json.gz", import.meta.url)),
  ),
);
function near(left, right) {
  if (typeof left === "number") {
    assert.equal(typeof right, "number");
    assert(Number.isFinite(right) && Math.abs(left - right) <= Math.max(1, Math.abs(left)) * 1e-7);
    return;
  }
  if (left && typeof left === "object") {
    assert.deepEqual(Object.keys(left).sort(), Object.keys(right).sort());
    for (const key of Object.keys(left)) near(left[key], right[key]);
    return;
  }
  assert.equal(left, right);
}
test("actual equipped native and WASM action maps compare by ID without losing their values", () => {
  const native = fixture.native.result.metrics,
    browser = fixture.browser.result.metrics;
  assert.notDeepEqual(
    native.parties[0].players[0].actions.map((row) => row.id),
    browser.parties[0].players[0].actions.map((row) => row.id),
  );
  near(canonicalizeHealingActionMetrics(native), canonicalizeHealingActionMetrics(browser));
});
test("action ordering preserves the input, target order and every non-action collection", () => {
  const input = structuredClone(fixture.native.result.metrics),
    before = structuredClone(input),
    output = canonicalizeHealingActionMetrics(input);
  assert.deepEqual(input, before);
  const prior = before.parties[0].players[0],
    after = output.parties[0].players[0];
  assert.deepEqual(after.resources, prior.resources);
  assert.deepEqual(after.auras, prior.auras);
  for (const action of prior.actions)
    assert.deepEqual(
      after.actions.find((row) => JSON.stringify(row.id) === JSON.stringify(action.id)),
      action,
    );
});
test("a changed cast value or ambiguous action ID cannot pass through ordering", () => {
  const changed = structuredClone(fixture.native.result.metrics),
    actions = changed.parties[0].players[0].actions;
  actions.find((row) => row.id.spellId === 10329).targets[0].casts += 1;
  assert.throws(() =>
    near(
      canonicalizeHealingActionMetrics(changed),
      canonicalizeHealingActionMetrics(fixture.browser.result.metrics),
    ),
  );
  const duplicate = structuredClone(fixture.native.result.metrics);
  duplicate.parties[0].players[0].actions.push(duplicate.parties[0].players[0].actions[0]);
  assert.throws(() => canonicalizeHealingActionMetrics(duplicate), /Duplicate metric action ID/);
});
