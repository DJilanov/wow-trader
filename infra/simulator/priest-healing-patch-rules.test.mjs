import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  extractPriestHealingBaseline,
  renderPriestHealingSources,
} from "./priest-healing-model.mjs";
import {
  priestHealingPatchRules,
  renderPriestHealingPatchRules,
  renderPriestPatchRuleTests,
} from "./priest-healing-patch-rules.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(sha(bytes), checksum);
  return JSON.parse(gunzipSync(bytes).toString("utf8"));
}
const evidence = fixture(
  "priest-client-healing-source.v1.json.gz",
  "e4ed880f99c62ca8de42ee1f20e22800541df6849d90e56b15811b4d0e3940ab",
);
const engine = fixture(
  "priest-healing-engine-source.v1.json.gz",
  "76c0a5888306f8ad3c0d3860d74c1866d1dbe88ff5de3b3064e5d8416f745e03",
);
const original = Object.fromEntries(
  Object.entries(engine.sources).map(([name, row]) => {
    assert.equal(sha(row.source), row.byteSha256);
    return [name, row.source];
  }),
);
const baseline = renderPriestHealingSources({
  ...original,
  baseline: extractPriestHealingBaseline(evidence),
  implementation: readFileSync(new URL("./priest-healing-spells.go", import.meta.url), "utf8"),
}).implementation;

test("official current rules correct the old no-periodic-crit assumption without granting class qualification", () => {
  assert.equal(priestHealingPatchRules.renewCanCrit, true);
  assert.equal(priestHealingPatchRules.periodicCritsTriggerDivineAegis, false);
  assert.equal(priestHealingPatchRules.innerFocusGrantsPeriodicCrit, false);
  assert.equal(priestHealingPatchRules.weakerShieldCanReplaceStronger, false);
  assert.equal(priestHealingPatchRules.classMechanicsAdmission, false);
  assert.equal(priestHealingPatchRules.publicationAllowed, false);
  assert.equal(priestHealingPatchRules.assumptions.renewCritChance, "application-snapshot");
});

test("the derived spell component snapshots Renew crit and checks/replaces the complete shield family", () => {
  const derived = renderPriestHealingPatchRules(baseline);
  assert.notEqual(derived, baseline);
  assert.equal(derived, renderPriestHealingPatchRules(baseline));
  assert(
    derived.includes("dot.SnapshotCritChance = min(1, max(0, dot.Spell.HealingCritChance()))"),
  );
  assert(derived.includes("kfcRenewCriticalTick(dot)"));
  assert(derived.includes("priest.kfcCanReplacePowerWordShield(sim, target, rank)"));
  assert(derived.includes("target.KFCActiveShieldFamily(sim, kfcPowerWordShieldFamily)"));
  assert.throws(() => renderPriestHealingPatchRules(derived), /anchor changed/);
  assert(baseline.includes("dot.OutcomeTick"));
});

test("deterministic historical controls keep their expected amounts by explicitly disabling crit", () => {
  const tests = {
    baseline: readFileSync(new URL("./priest-healing-regression_test.go", import.meta.url), "utf8"),
    talents: readFileSync(new URL("./priest-healing-talents_test.go", import.meta.url), "utf8"),
  };
  const before = globalThis.structuredClone(tests);
  const derived = renderPriestPatchRuleTests(tests);
  assert.deepEqual(tests, before);
  assert.equal(
    derived.baseline.replace(
      "\tspell := priest.Renew[9]\n\tspell.BonusCritRating = -10000\n",
      "\tspell := priest.Renew[9]\n",
    ),
    tests.baseline,
  );
  assert.equal(
    derived.talents.replace("\tpriest.Renew[9].BonusCritRating = -10000\n", ""),
    tests.talents,
  );
});
