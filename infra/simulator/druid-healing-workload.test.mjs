import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  renderDruidHealingDamageTracking,
  renderDruidHealingWorkload,
} from "./druid-healing-workload.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/druid-healing-controller-source.v1.json.gz", import.meta.url)),
  ),
);

test("Druid derives the actual healing runner without Priest talent or spell fallbacks", () => {
  const result = renderDruidHealingWorkload(fixture.sources);
  for (const source of Object.values(result)) {
    assert(source.startsWith("package restoration"));
    for (const unsupported of [
      "HealingPriest",
      "UseInnerFocus",
      "UsePowerInfusion",
      "KeepRenew",
      "priest.",
    ])
      assert(!source.includes(unsupported), unsupported);
  }
  assert(result.workload.includes("ConfigureKFCDruidHealing(positions, frame.HealingPolicy)"));
  assert(result.workload.includes("kfcDruidPriorityTarget(sim, priority)"));
  assert(result.workload.includes("InnervateMinimumMissingMana *float64"));
  assert(result.workload.includes("output.DeliveredIncomingDamageMean += event.Amount"));
  assert(result.workload.includes("unit.ConfigureKFCHealingBenchmarkHealth(sim, maximum)"));
  assert(result.job.includes("decoder.DisallowUnknownFields()"));
  assert(result.job.includes("kfc-druid-healing-job.v1"));
  assert(result.job.includes("kfcHealingUnknownFields(request.ProtoReflect())"));
});

test("an incompatible parent controller fails rather than silently skipping a Druid path", () => {
  assert.throws(() =>
    renderDruidHealingWorkload({ ...fixture.sources, workload: "package healing" }),
  );
  assert.throws(() =>
    renderDruidHealingWorkload({ ...fixture.sources, cooldowns: "package healing" }),
  );
});

test("Druid damage tracking is installed during initialization, before the first workload", () => {
  const baseline = readFileSync(new URL("./druid-healing-baseline.go", import.meta.url), "utf8");
  assert(
    renderDruidHealingDamageTracking(baseline).includes("resto.registerKFCDruidDamageTracking()"),
  );
  assert.throws(() => renderDruidHealingDamageTracking(""));
});
