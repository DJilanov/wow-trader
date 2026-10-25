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
  priestCurrentHealingRules,
  renderPriestCurrentHealingRules,
  renderPriestPatchRuleTests,
  renderPriestCurrentShieldImplementation,
} from "./priest-healing-current-rules.mjs";

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

test("current rules distinguish periodic healing crits without granting class qualification", () => {
  assert.equal(priestCurrentHealingRules.renewCanCrit, true);
  assert.equal(priestCurrentHealingRules.periodicCritsTriggerDivineAegis, false);
  assert.equal(priestCurrentHealingRules.innerFocusGrantsPeriodicCrit, false);
  assert.equal(priestCurrentHealingRules.weakerShieldCanReplaceStronger, false);
  assert.equal(priestCurrentHealingRules.classMechanicsAdmission, false);
  assert.equal(priestCurrentHealingRules.publicationAllowed, false);
  assert.equal(
    priestCurrentHealingRules.assumptions.renewCritChance,
    "tick-time-current-healing-crit",
  );
});

test("the derived spell component uses live healing crit and checks the complete shield family", () => {
  const derived = renderPriestCurrentHealingRules(baseline);
  assert.notEqual(derived, baseline);
  assert.equal(derived, renderPriestCurrentHealingRules(baseline));
  assert(!derived.includes("dot.SnapshotCritChance ="));
  assert(derived.includes("kfcRenewHealingTick(dot)"));
  assert(derived.includes("priest.kfcCanReplacePowerWordShield(sim, target, rank)"));
  assert(derived.includes("target.KFCActiveShieldFamily(sim, kfcPowerWordShieldFamily)"));
  assert.throws(() => renderPriestCurrentHealingRules(derived), /anchor changed/);
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

test("the current shield implementation excludes the superseded snapshot-only outcome", () => {
  const source = readFileSync(new URL("./priest-healing-patch-rules.go", import.meta.url), "utf8");
  const result = renderPriestCurrentShieldImplementation(source);
  assert(!result.includes("func kfcRenewCriticalTick("));
  assert(result.includes("func (priest *Priest) kfcCanReplacePowerWordShield("));
  assert.throws(() => renderPriestCurrentShieldImplementation(result));
});
