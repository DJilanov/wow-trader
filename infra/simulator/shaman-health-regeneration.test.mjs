import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractShamanHealthRegeneration,
  renderShamanHealthRegeneration,
} from "./shaman-health-regeneration.mjs";

const read = (path) => String(readFileSync(new URL(path, import.meta.url)));
const evidence = JSON.parse(
  gunzipSync(
    readFileSync(new URL("fixtures/shaman-shared-equipment-source.v1.json.gz", import.meta.url)),
  ),
);
const parent =
  "../../artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-cast-resource-sets-v3/6e9e9d83dd4062dc0006f35704a4853f29236a46802798a983aa18a86d2a5049/build-acd2ty/workspace/";

test("Shadowcraft regeneration retains exact source amount and explicit timing references", () => {
  const rules = extractShamanHealthRegeneration(evidence);
  assert.deepEqual(
    [rules.setId, rules.pieces, rules.spellId, rules.healthPerFive],
    [184, 6, 21347, 15],
  );
  assert.equal(rules.rawEffectPeriodMs, 0);
  assert.equal(rules.sourceTickTimingVerified, false);
  assert.equal(rules.resourceOnly, true);
  assert.equal(rules.amountScalesWithHealingPower, false);
  assert.equal(rules.tickReferences.length, 2);
  assert.equal(rules.publicationAllowed, false);
});

test("amount, coefficient, target, threshold or newly sourced cadence changes require review", () => {
  for (const mutate of [
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 21347).EffectBasePointsF = 30;
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 21347).EffectAuraPeriod = 2000;
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 21347).EffectBonusCoefficient = 1;
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 21347).ImplicitTarget = [6, 0];
    },
    (data) => {
      data.tables.ItemSetSpell.find(
        (row) => row.ItemSetID === 184 && row.Threshold === 6,
      ).Threshold = 5;
    },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractShamanHealthRegeneration(changed));
  }
});

test("provider composition preserves the Elements implementation and rejects duplicate integrations", () => {
  const input = {
    evidence,
    implementation: read("shaman-health-regeneration.go"),
    actor: read(parent + "sim/shaman/restoration/kfc_baseline.go"),
    elements: read(parent + "sim/shaman/restoration/kfc_elements.go"),
  };
  const before = structuredClone(input);
  const result = renderShamanHealthRegeneration(input);
  assert.deepEqual(input, before);
  assert(result.actor.includes("kfcHealthRegeneration *kfcShamanHealthRegeneration"));
  assert(result.elements.includes("kfcShamanElementsSetBonuses()"));
  assert.equal(
    result.elements.replace(
      "kfcShamanElementsSetBonuses()",
      "KFCShamanAdditionalHealingSetBonuses()",
    ),
    input.elements,
  );
  assert.throws(() => renderShamanHealthRegeneration({ ...input, ...result }));
  for (const key of ["implementation", "actor", "elements"])
    assert.throws(() => renderShamanHealthRegeneration({ ...input, [key]: "" }));
});
