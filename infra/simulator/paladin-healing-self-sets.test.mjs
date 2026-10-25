import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { renderPaladinHealingCastSets } from "./paladin-healing-cast-sets.mjs";
import {
  extractPaladinHealingSelfSets,
  renderPaladinHealingSelfSets,
} from "./paladin-healing-self-sets.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-healing-sets-source.v1.json.gz", import.meta.url)),
  ),
);
const implementation = readFileSync(
  new URL("./paladin-healing-self-sets.go", import.meta.url),
  "utf8",
);
const previous = renderPaladinHealingCastSets(
  source,
  readFileSync(new URL("./paladin-healing-cast-sets.go", import.meta.url), "utf8"),
);
const integrations = {
  actor: previous.actor,
  workload: previous.workload,
  damage: source.integration.damage,
};

test("Paladin self-set extraction preserves six thresholds and explicit timing/self-damage assumptions", () => {
  const original = structuredClone(source);
  const rules = extractPaladinHealingSelfSets(source);
  assert.equal(rules.thresholds.length, 6);
  assert.equal(rules.viper.cooldownMs, 300000);
  assert.equal(rules.scarlet.shield, 480);
  assert.equal(rules.devout.shield, 488);
  assert.equal(rules.devout.periodicDamageEligible, false);
  assert.equal(rules.blessed.partyOnly, true);
  assert.equal(rules.selfDamageEligibilityVerified, false);
  assert.equal(rules.regenerationCountsAsSpellHealing, false);
  assert.deepEqual(source, original);
});

test("Paladin self-set adapter preserves damage ownership and distinguishes periodic delivery", () => {
  const result = renderPaladinHealingSelfSets(source, integrations, implementation);
  assert(result.actor.includes("selfSets *kfcPaladinSelfSets"));
  assert.equal(result.workload.split('`json:"selfSetPolicy,omitempty"`').length, 3);
  assert(result.damage.includes("unit.RemoveHealth(sim,result.Damage)"));
  assert.equal(result.damage.split("unit.RemoveHealth(sim,result.Damage)").length, 2);
  assert(result.damage.includes("receive(sim,spell,result,false)"));
  assert(result.damage.includes("receive(sim,spell,result,true)"));
  assert(result.damage.includes("healer.triggerKFCGraceDeathHeal(sim)"));
  assert(result.implementation.includes("const kfcPaladinBlessedRadius = 30"));
  assert.throws(() =>
    renderPaladinHealingSelfSets(
      source,
      {
        ...integrations,
        damage: integrations.damage.replace("result.Damage <= 0", "result.Damage < 0"),
      },
      implementation,
    ),
  );
});

test("Paladin self-set extraction fails closed on changed payloads, masks, cadence or thresholds", () => {
  for (const change of [
    (copy) => {
      copy.tables.SpellEffect.find((row) => row.SpellID === 1293733).EffectBasePointsF = 500;
    },
    (copy) => {
      copy.tables.SpellAuraOptions.find((row) => row.SpellID === 27778).ProcTypeMask[0] |= 0x80000;
    },
    (copy) => {
      copy.tables.SpellEffect.find((row) => row.SpellID === 1291797).EffectAuraPeriod = 2000;
    },
    (copy) => {
      copy.tables.ItemSetSpell.find(
        (row) => row.ItemSetID === 1968 && row.Threshold === 4,
      ).Threshold = 5;
    },
  ]) {
    const changed = structuredClone(source);
    change(changed);
    assert.throws(() => extractPaladinHealingSelfSets(changed));
  }
});
