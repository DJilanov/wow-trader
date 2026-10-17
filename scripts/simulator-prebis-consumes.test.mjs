import assert from "node:assert/strict";
import { test } from "node:test";
import {
  preRaidConsumeSettings,
  weaponConsumeProblem,
} from "../infra/simulator/prebis-consumes.mjs";

function fixture() {
  return {
    baseline: {
      schema: "kfc-optimization-baseline.v1",
      settings: {
        player: {
          consumes: {
            mainHandImbue: "ElementalSharpeningStone",
            offHandImbue: "ElementalSharpeningStone",
            strengthBuff: "JujuPower",
          },
          equipment: { items: Array.from({ length: 17 }, (_, slot) => ({ id: slot + 1 })) },
        },
      },
    },
    db: {
      items: [
        { id: 15, type: 13, weaponType: 9 },
        { id: 16, type: 13, weaponType: 4 },
      ],
    },
  };
}

test("raid-recipe weapon stones become compatible non-raid stones without mutating inputs", () => {
  const { baseline, db } = fixture();
  const original = globalThis.structuredClone(baseline);
  const result = preRaidConsumeSettings(baseline, db);
  assert.equal(result.settings.player.consumes.mainHandImbue, "DenseSharpeningStone");
  assert.equal(result.settings.player.consumes.offHandImbue, "DenseWeightstone");
  assert.equal(result.settings.player.consumes.strengthBuff, "JujuPower");
  assert.deepEqual(
    result.changes.map((entry) => entry.recipeItemId),
    [18264, 18264],
  );
  assert.deepEqual(baseline, original);
  db.items[0].weaponType = 8;
  assert.equal(
    preRaidConsumeSettings(baseline, db).settings.player.consumes.mainHandImbue,
    "DenseWeightstone",
  );
  assert.deepEqual(
    preRaidConsumeSettings({ ...baseline, settings: result.settings }, db).changes,
    [],
  );
});

test("ZG oils are distinct from their non-raid replacements and no missing weapon is fabricated", () => {
  const { baseline, db } = fixture();
  baseline.settings.player.consumes.mainHandImbue = "BrilliantWizardOil";
  baseline.settings.player.consumes.offHandImbue = "BrilliantManaOil";
  const result = preRaidConsumeSettings(baseline, db);
  assert.equal(result.settings.player.consumes.mainHandImbue, "WizardOil");
  assert.equal(result.settings.player.consumes.offHandImbue, "LesserManaOil");
  baseline.settings.player.equipment.items[15] = {};
  assert.equal(
    preRaidConsumeSettings(baseline, db).settings.player.consumes.offHandImbue,
    undefined,
  );
  db.items[0].weaponType = 7;
  assert.throws(() => preRaidConsumeSettings(baseline, db), /compatibility/);
});

test("final weapon swaps cannot silently retain an incompatible Dense stone", () => {
  const { baseline, db } = fixture();
  const { settings } = preRaidConsumeSettings(baseline, db);
  assert.equal(weaponConsumeProblem(settings, db), "");
  db.items[0].weaponType = 4;
  assert.match(weaponConsumeProblem(settings, db), /select DenseWeightstone/);
  settings.player.consumes.mainHandImbue = "DenseWeightstone";
  assert.equal(weaponConsumeProblem(settings, db), "");
  settings.player.equipment.items[15] = {};
  assert.match(weaponConsumeProblem(settings, db), /remove the weapon consume/);
});
