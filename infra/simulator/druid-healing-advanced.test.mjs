import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { extractDruidHealingBaseline, renderDruidHealingBaseline } from "./druid-healing-model.mjs";
import {
  extractDruidAdvancedHealing,
  renderDruidAdvancedHealing,
} from "./druid-healing-advanced.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-client-healing-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "e3912ed6cbd434dfd20181758ed331ea0c93f3c81c85329f77ca31e601ae3c22",
);
const evidence = JSON.parse(gunzipSync(bytes)),
  rules = extractDruidAdvancedHealing(evidence),
  baseline = extractDruidHealingBaseline(evidence);

test("current Druid special ranks retain actual mana, cooldown, tick and radius records", () => {
  assert.equal(rules.ranks.length, 8);
  const swift = rules.ranks.find((row) => row.id === 18562),
    tranq = rules.ranks.find((row) => row.id === 9863),
    growth = rules.ranks.find((row) => row.id === 1238215);
  assert.equal(swift.baseManaFraction, 0.2);
  assert.equal(swift.cooldownMs, 15000);
  assert.deepEqual(
    [tranq.mana, tranq.cooldownMs, tranq.durationMs, tranq.tickMs, tranq.radius],
    [925, 300000, 10000, 2000, 20],
  );
  assert.deepEqual(
    [
      growth.mana,
      growth.cooldownMs,
      growth.durationMs,
      growth.tickMs,
      growth.coefficient,
      growth.radius,
    ],
    [1050, 6000, 7000, 1000, 0.033, 43.5],
  );
  assert.equal(rules.naturesSwiftnessCooldownMs, 180000);
  assert.equal(rules.wildGrowthDecayVerified, false);
  assert.equal(rules.swiftmendSelectionVerified, false);
});
test("resolved client rank text provides the actual talent curves and HoT extensions", () => {
  assert.deepEqual(rules.talents.naturalist.values, [0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  assert.deepEqual(rules.talents.improvedRegrowth.values, [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(rules.talents.improvedTranquility.values, [0, 30, 60]);
  assert.deepEqual(rules.splendorMs, { rejuvenation: 3000, regrowth: 6000 });
  assert.equal(rules.classMechanicsAdmission, false);
  const invalid = globalThis.structuredClone(evidence);
  invalid.classTalents.find((row) => row.spellId === 17069).ranks[0].resolved = false;
  assert.throws(() => extractDruidAdvancedHealing(invalid));
});
test("the advanced actor derives baseline anchors and source data without mutating the original", () => {
  const source = readFileSync(new URL("./druid-healing-baseline.go", import.meta.url), "utf8"),
    baselineSource = renderDruidHealingBaseline({ implementation: source, baseline }),
    implementation = readFileSync(new URL("./druid-healing-advanced.go", import.meta.url), "utf8"),
    output = renderDruidAdvancedHealing({ baselineSource, implementation, rules, baseline });
  assert(baselineSource.includes("do not admit unverified"));
  assert(!output.baselineSource.includes("do not admit unverified"));
  assert(output.baselineSource.includes("resto.registerKFCAdvancedHealing()"));
  assert(!output.implementation.includes("// KFC_DRUID_ADVANCED_DATA"));
  assert.throws(() =>
    renderDruidAdvancedHealing({
      baselineSource: "changed source",
      implementation,
      rules,
      baseline,
    }),
  );
});
