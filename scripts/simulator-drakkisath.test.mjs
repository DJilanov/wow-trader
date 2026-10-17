import assert from "node:assert/strict";
import { test } from "node:test";
import {
  drakkisathModels,
  assertDrakkisathDatabase,
  patchCasterCritChance,
  reconcileDrakkisathPassives,
  validateDrakkisathClient,
} from "../infra/simulator/drakkisath-trinkets.mjs";

function fixture() {
  return {
    equipment: {
      items: drakkisathModels.map((model) => ({
        id: model.itemId,
        type: 12,
        stats: Array.from({ length: 44 }, (_, index) => (index === model.statIndex ? 2 : 0)),
      })),
    },
    imports: {
      items: drakkisathModels.map((model) => ({ id: model.itemId, status: "classic-provisional" })),
    },
    evidence: {
      schema: "kfc-drakkisath-models.v1",
      models: globalThis.structuredClone(drakkisathModels),
    },
  };
}

test("current trinket passives replace historical stats once and preserve provisional metadata", () => {
  const input = fixture();
  const before = globalThis.structuredClone(input);
  const result = reconcileDrakkisathPassives(input.equipment, input.imports, input.evidence);
  assert.deepEqual(input, before);
  for (const model of drakkisathModels) {
    const item = result.equipment.items.find((entry) => entry.id === model.itemId);
    assert.equal(item.stats[model.statIndex], 1);
    assert.equal(
      item.stats.reduce((sum, value) => sum + value, 0),
      1,
    );
    const metadata = result.imports.items.find((entry) => entry.id === model.itemId);
    assert.equal(metadata.status, "classic-provisional");
    assert.match(metadata.note, /not modeled/);
    assert.deepEqual(metadata.effectModel, model);
  }
  assert.deepEqual(
    reconcileDrakkisathPassives(result.equipment, result.imports, input.evidence),
    result,
  );
  assertDrakkisathDatabase(result.equipment);
  assert.throws(() => assertDrakkisathDatabase(input.equipment), /rebuild/);
  assert.throws(() => assertDrakkisathDatabase({ items: [] }), /Missing/);
});

test("missing, changed or newly-current metadata cannot silently use a partial trinket overlay", () => {
  for (const corrupt of [
    (input) => input.equipment.items.pop(),
    (input) => {
      input.equipment.items[0].stats[0] = 20;
    },
    (input) => {
      input.equipment.items[0].stats[19] = 3;
    },
    (input) => {
      input.imports.items[0].status = "current-client";
    },
    (input) => {
      input.evidence.models[0].unsupportedSpellIds = [];
    },
    (input) => {
      input.evidence.models[0].cooldownSeconds = 30;
    },
    (input) => input.evidence.models.pop(),
  ]) {
    const input = fixture();
    corrupt(input);
    assert.throws(() =>
      reconcileDrakkisathPassives(input.equipment, input.imports, input.evidence),
    );
  }
});

test("empty raw trinket evidence fails closed", () => {
  assert.throws(() => validateDrakkisathClient(new Map()), /Missing/);
  assert.throws(
    () =>
      validateDrakkisathClient(
        new Map(
          [
            "ItemXItemEffect",
            "ItemEffect",
            "SpellEffect",
            "SpellAuraOptions",
            "SpellMisc",
            "Spell",
            "SpellDuration",
          ].map((name) => [name, []]),
        ),
      ),
    /Reviewed current Drakkisath effects changed/,
  );
});

test("caster-specific crit hooks patch exactly once and reject source drift", () => {
  for (const [kind, source] of [
    [
      "target",
      "\tBonusSpellDamageTaken float64 // For effects like mob type spell damage bonuses.",
    ],
    [
      "physical",
      "\treturn critRating/(CritRatingPerCritChance*100) - attackTable.MeleeCritSuppression",
    ],
    ["spell", "\t\ttarget.GetSchoolCritTakenChance(spell) +"],
  ]) {
    const fixed = patchCasterCritChance(source, kind);
    assert.notEqual(fixed, source);
    assert.match(fixed, /BonusCritChanceTaken/);
    assert.equal(patchCasterCritChance(fixed, kind), fixed);
    assert.throws(() => patchCasterCritChance("unreviewed upstream source", kind));
    assert.throws(() => patchCasterCritChance(source + source, kind));
  }
  assert.throws(() => patchCasterCritChance("", "unknown"));
});
