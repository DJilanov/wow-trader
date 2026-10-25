import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinHealingCastSets,
  renderPaladinHealingCastSets,
} from "./paladin-healing-cast-sets.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-healing-sets-source.v1.json.gz", import.meta.url)),
  ),
);
const implementation = readFileSync(
  new URL("./paladin-healing-cast-sets.go", import.meta.url),
  "utf8",
);

test("Paladin cast sets distinguish dummy and literal proc fields from unverified server rates", () => {
  const original = structuredClone(source);
  const rules = extractPaladinHealingCastSets(source);
  assert.deepEqual(rules.setIds, [183, 185, 187, 188]);
  assert.equal(rules.wildheartReferenceManaChance, 0.02);
  assert.equal(rules.wildheartDummyProcChance, 1);
  assert.equal(rules.castPowerReferenceChance, 1);
  assert.equal(rules.serverRatesVerified, false);
  assert.equal(rules.numericalAdmission, false);
  assert.deepEqual(rules.dreadmist, {
    chance: 0.05,
    low: 270,
    high: 330,
    coefficient: 0,
    referenceCanCrit: false,
  });
  assert.deepEqual(source, original);
});

test("Paladin cast-set adapter derives only owned actor/workload additions", () => {
  const rendered = renderPaladinHealingCastSets(source, implementation);
  assert(rendered.actor.includes("castSets *kfcPaladinCastSets"));
  assert(rendered.actor.includes("holy.registerKFCPaladinCastSets()"));
  assert.equal(rendered.workload.split('`json:"castSetPolicy,omitempty"`').length, 3);
  assert(rendered.workload.includes("ConfigureKFCPaladinCastSets(sim,frame.CastSetPolicy)"));
  assert(rendered.implementation.includes("const kfcPaladinCastSetPower = 65"));
  assert(!rendered.implementation.includes("// KFC_PALADIN_CAST_SET_VALUES"));
  assert.throws(() =>
    renderPaladinHealingCastSets(source, implementation + "\n// KFC_PALADIN_CAST_SET_VALUES"),
  );
  const changed = structuredClone(source);
  changed.integration.actor = changed.integration.actor.replace(
    "itemHealthRegen *kfcPaladinItemHealthRegen",
    "unexpectedParent *UnexpectedParent",
  );
  assert.throws(() => renderPaladinHealingCastSets(changed, implementation));
});

test("Paladin cast-set extraction rejects changed proc eligibility, payloads and duration", () => {
  for (const change of [
    (copy) => {
      copy.tables.SpellAuraOptions.find((row) => row.SpellID === 450625).ProcTypeMask[0] = 4;
    },
    (copy) => {
      copy.tables.SpellAuraOptions.find((row) => row.SpellID === 450608).ProcChance = 5;
    },
    (copy) => {
      copy.tables.SpellEffect.find((row) => row.SpellID === 450583).EffectBonusCoefficient = 1;
    },
    (copy) => {
      copy.tables.SpellEffect.find((row) => row.SpellID === 27782).EffectBasePointsF = 300;
    },
    (copy) => {
      copy.tables.SpellMisc.find((row) => row.SpellID === 27499).DurationIndex = 0;
    },
  ]) {
    const changed = structuredClone(source);
    change(changed);
    assert.throws(() => extractPaladinHealingCastSets(changed));
  }
});
