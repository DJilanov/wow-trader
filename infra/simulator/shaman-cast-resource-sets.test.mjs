import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractShamanCastResourceSets,
  renderShamanCastResourceSets,
} from "./shaman-cast-resource-sets.mjs";

const read = (path) => String(readFileSync(new URL(path, import.meta.url))),
  prefix =
    "../../artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-elements-v1/461783ac627058a0cf0998f315ffbe869da87270e0311a6c2db9b2cbea108d94/build-CJZ8Dt/workspace/";
const evidence = JSON.parse(
    gunzipSync(
      readFileSync(new URL("fixtures/shaman-shared-equipment-source.v1.json.gz", import.meta.url)),
    ),
  ),
  extension = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL("fixtures/shaman-shared-equipment-text-source.v1.json.gz", import.meta.url),
      ),
    ),
  );

test("four exact cast-resource sets retain actual amounts, conditions and explicit scripting references", () => {
  const rules = extractShamanCastResourceSets(evidence, extension);
  assert.deepEqual(
    rules.sets.map((row) => row.setId),
    [181, 182, 183, 185],
  );
  assert(rules.sets.every((row) => row.itemIds.length === 8 && row.pieces === 5));
  assert.equal(rules.mana, 200);
  assert.deepEqual([rules.dreadmist.low, rules.dreadmist.high], [270, 330]);
  assert.equal(rules.fixedProcChance, 0.05);
  assert.equal(rules.serverScriptVerified, false);
  assert.equal(rules.nonzeroCoefficientMetadataPreserved, true);
  assert.equal(rules.publicationAllowed, false);
});

test("new class restrictions, proc probabilities, heal scaling or reward drift require review", () => {
  for (const mutate of [
    (data) => {
      data.tables.SpellAuraOptions.find((row) => row.SpellID === 450527).ProcChance = 100;
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 450583).EffectBonusCoefficient = 1;
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 27782).EffectBasePointsF = 400;
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 450608).EffectAura = 42;
    },
    (data) => {
      data.tables.SpellMisc.find((row) => row.SpellID === 450583).SchoolMask = 8;
    },
  ]) {
    const changed = structuredClone(extension);
    mutate(changed);
    assert.throws(() => extractShamanCastResourceSets(evidence, changed));
  }
});

test("healer-only inherited-handler bypass and initialization are atomic and reject duplicate integration", () => {
  const input = {
      implementation: read("shaman-cast-resource-sets.go"),
      actor: read(prefix + "sim/shaman/restoration/kfc_baseline.go"),
      commonSets: read(prefix + "sim/common/item_sets/dungeon_set_1.go"),
      evidence,
      extension,
    },
    before = structuredClone(input),
    output = renderShamanCastResourceSets(input);
  assert.deepEqual(input, before);
  assert(output.commonSets.includes("KFCControlsShamanCastResourceSets"));
  assert(output.actor.includes("resto.registerKFCShamanCastResourceSets()"));
  assert(
    output.actor.indexOf("resto.registerKFCShamanCastResourceSets()") <
      output.actor.indexOf("resto.prepareKFCShamanHealingRelics()"),
  );
  assert.throws(() => renderShamanCastResourceSets({ ...input, ...output }));
  for (const key of ["implementation", "actor", "commonSets"])
    assert.throws(() => renderShamanCastResourceSets({ ...input, [key]: "" }));
});
