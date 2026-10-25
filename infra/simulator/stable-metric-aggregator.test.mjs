import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { applyStableMetricAggregation } from "./stable-metric-aggregator.mjs";

const root = new URL("../../", import.meta.url),
  model = JSON.parse(
    await readFile(
      new URL(
        "artifacts/forever-simulator/optimization/mage-full-raid-model-v1/context.json",
        root,
      ),
    ),
  ),
  base = {};
for (const [key, path] of [
  ["utils", "sim/core/utils.go"],
  ["concurrent", "sim/core/sim_concurrent.go"],
]) {
  const location = model.workspace + "/" + path,
    pin = model.sourcePins.find((row) => row.path === location),
    bytes = await readFile(new URL(location, root));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.byteSha256);
  base[key] = bytes.toString();
}

test("the exact parent accumulator and both worker mergers use stable central moments", () => {
  const before = structuredClone(base),
    result = applyStableMetricAggregation(base);
  assert.deepEqual(base, before);
  assert(result.utils.includes("x.moments.add(v)"));
  assert(result.utils.includes("x.moments.scale(f)"));
  assert(result.utils.includes("x.moments.merge(y.moments)"));
  assert(result.concurrent.includes("base.Avg = moments.meanOrNaN()"));
  assert(result.concurrent.includes("base.UptimeSecondsAvg = moments.meanOrNaN()"));
  assert(!result.concurrent.includes("math.Sqrt(base.AggregatorData.SumSq/"));
  assert(!result.utils.includes("math.Sqrt(x.sumSq/"));
});

test("changed, ambiguous and already-patched sources fail without mutation", () => {
  assert.throws(() => applyStableMetricAggregation(applyStableMetricAggregation(base)));
  for (const change of [
    (value) => {
      value.utils = value.utils.replace("x.sumSq += v * v", "x.sumSq = v");
    },
    (value) => {
      value.concurrent += value.concurrent;
    },
    (value) => {
      value.concurrent = value.concurrent.replace(
        "base.UptimeSecondsAvg*base.UptimeSecondsAvg",
        "0",
      );
    },
  ]) {
    const value = structuredClone(base);
    change(value);
    const before = structuredClone(value);
    assert.throws(() => applyStableMetricAggregation(value));
    assert.deepEqual(value, before);
  }
});
