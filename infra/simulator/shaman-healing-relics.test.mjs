import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { renderShamanHealingRelics } from "./shaman-healing-relics.mjs";

const parent =
  "../../artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-current-items-v1/d52f4b767c3a58f63799ce03d4595404ca3526dc373a02aa65c0c0d6938bf1d2/build-L93QGX/workspace/";
const read = (path) => String(readFileSync(new URL(path, import.meta.url)));
const input = {
  implementation: read("shaman-healing-relics.go"),
  actor: read(parent + "sim/shaman/restoration/kfc_baseline.go"),
  sharedItems: read(parent + "sim/shaman/items.go"),
  resources: read(parent + "sim/shaman/restoration/kfc_resource_actives.go"),
  coreSpell: read(parent + "sim/core/spell.go"),
  evidence: JSON.parse(
    gunzipSync(
      readFileSync(new URL("fixtures/shaman-relic-families-source.v1.json.gz", import.meta.url)),
    ),
  ),
};

test("actual source renderer retains all ten relics and explicit runtime reference scope", () => {
  const before = structuredClone(input);
  const output = renderShamanHealingRelics(input);
  assert.deepEqual(input, before);
  assert.deepEqual(output.rules.healingRelevantItemIds, [22345, 23200, 249398, 272431, 279249]);
  assert.equal(output.rules.items.length, 10);
  assert.equal(output.rules.runtimeAdmission, false);
  for (const id of input.evidence.relicIds) assert(output.implementation.includes(id + ":"));
  assert(
    output.actor.indexOf("resto.prepareKFCShamanHealingRelics()") <
      output.actor.indexOf("resto.registerKFCShamanWaterTotems()"),
  );
  assert.equal(output.resources.split("resto.kfcShamanShieldMaximumCharges()").length, 3);
  assert(output.coreSpell.includes("sc.kfcShamanRelicCostFactor != 0"));
  assert(output.sharedItems.includes("KFCControlsShamanHealingRelics"));
});

test("duplicate or missing integration anchors fail before compilation", () => {
  const output = renderShamanHealingRelics(input);
  assert.throws(() => renderShamanHealingRelics({ ...input, ...output }));
  for (const key of ["implementation", "actor", "sharedItems", "resources", "coreSpell"]) {
    assert.throws(() => renderShamanHealingRelics({ ...input, [key]: "" }), key);
  }
});

test("changed current amounts or family masks cannot silently reach runtime", () => {
  for (const mutate of [
    (evidence) => {
      evidence.tables.SpellEffect.find((row) => row.SpellID === 1291076).EffectBasePointsF = -10;
    },
    (evidence) => {
      evidence.tables.SpellEffect.find((row) => row.SpellID === 27797).EffectSpellClassMask = [
        64, 0, 0, 0,
      ];
    },
    (evidence) => {
      evidence.tables.ItemXItemEffect.pop();
    },
  ]) {
    const changed = structuredClone(input);
    mutate(changed.evidence);
    assert.throws(() => renderShamanHealingRelics(changed));
  }
});
