import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  applyWarriorHeroismDispatch,
  extendWarriorHeroismCatalog,
  extractWarriorHeroismRules,
  extendWarriorHeroismInspection,
  warriorHeroismItemIds,
} from "./warrior-heroism-model.mjs";
import { eligiblePrebis, prebisSlotTypes } from "./prebis-pool.mjs";

const evidence = JSON.parse(
  gunzipSync(
    await readFile(new URL("./fixtures/warrior-heroism-source.v1.json.gz", import.meta.url)),
  ),
);

test("current base Heroism has the four exact thresholds, no rage and flat AP rather than Strength", () => {
  const rules = extractWarriorHeroismRules(evidence);
  assert.deepEqual(
    [
      rules.setId,
      rules.resistancesAtTwo,
      rules.attackPowerAtSix,
      rules.rangedAttackPowerAtSix,
      rules.bonusArmorAtEight,
    ],
    [511, 8, 40, 40, 200],
  );
  assert.deepEqual(
    [rules.proc.minimumHealing, rules.proc.maximumHealing, rules.proc.rage],
    [88, 132, 0],
  );
  assert.equal(rules.proc.whiteMeleeOnly, true);
  assert.equal(rules.proc.serverCadenceVerified, false);
  assert.equal(rules.currentServerAcquisitionVerified, false);
});

test("all eight source-backed rewards normalize with acquisition restrictions and preserve the parent", () => {
  const parent = { items: [{ id: 25, name: "Parent sentinel" }], enchants: [] },
    before = globalThis.structuredClone(parent),
    result = extendWarriorHeroismCatalog(parent, evidence);
  assert.deepEqual(parent, before);
  assert.deepEqual(result.db.items.slice(0, parent.items.length), parent.items);
  assert.deepEqual(
    result.additions.map((row) => row.id),
    [...warriorHeroismItemIds],
  );
  assert.equal(result.additions.length, 8);
  for (const item of result.additions) {
    assert.equal(item.setId, 511);
    assert.deepEqual(item.classAllowlist, [9]);
    assert.equal(item.armorType, 4);
    assert.equal(item.factionRestriction, undefined);
    const source = result.sources.find((row) => row.id === item.id);
    assert.deepEqual(source.sources[0].quests.map((row) => row.faction).sort(), [
      "Alliance",
      "Horde",
    ]);
    assert.equal(source.acquisition.currentServerVerified, false);
  }
  const boots = result.additions.find((row) => row.id === 21995),
    helm = result.additions.find((row) => row.id === 21999),
    belt = result.additions.find((row) => row.id === 21994);
  assert.equal(boots.stats[18], 1);
  assert.equal(helm.stats[19], 1);
  assert.equal(belt.stats[28], 7);
  assert.equal(result.numericalReuseAllowed, false);
  assert.equal(result.publicationAllowed, false);
  assert.throws(() => extendWarriorHeroismCatalog(result.db, evidence), /Refusing to replace/);
  for (const factionName of ["Alliance", "Horde"]) {
    const context = {
      requireCraftAudit: true,
      factionName,
      playerClass: 9,
      professions: [1, 4],
      currentIds: new Set(),
    };
    for (const item of result.additions) {
      const source = result.sources.find((row) => row.id === item.id),
        slot = prebisSlotTypes.indexOf(item.type);
      assert.equal(eligiblePrebis(item, source, context, slot), true);
      assert.equal(eligiblePrebis(item, source, { ...context, playerClass: 4 }, slot), false);
    }
  }
});

test("inspection preserves existing metadata and represents guaranteed rewards without mutually exclusive choices", () => {
  const parent = { sets: { 189: { name: "Battlegear of Valor" } }, items: { 25: { setId: 0 } } },
    before = globalThis.structuredClone(parent),
    result = extendWarriorHeroismInspection(parent, evidence);
  assert.deepEqual(parent, before);
  assert.deepEqual(result.sets[189], parent.sets[189]);
  assert.deepEqual(result.items[25], parent.items[25]);
  assert.deepEqual(
    result.sets[511].effects.map((row) => row.threshold),
    [2, 4, 6, 8],
  );
  for (const id of warriorHeroismItemIds) {
    assert.equal(result.items[id].questRewardOnce, true);
    assert.deepEqual(result.items[id].questChoices, []);
  }
  assert.throws(() => extendWarriorHeroismInspection(result, evidence), /Refusing to replace/);
});

test("alternate-set thresholds, rage payloads, proc masks, dynamic effects and incomplete access evidence fail closed", () => {
  const mutations = [
    (x) => {
      x.normalized.setEffects.find((row) => row.ItemSetID === 511 && row.Threshold === 4).SpellID =
        450587;
    },
    (x) => {
      x.tables.SpellEffect.find((row) => row.SpellID === 27418).Effect = 30;
    },
    (x) => {
      x.tables.SpellAuraOptions.find((row) => row.SpellID === 27419).ProcTypeMask[0] = 20;
    },
    (x) => {
      x.tables.SpellEffect.find((row) => row.SpellID === 14049).Coefficient = 1;
    },
    (x) => {
      x.acquisition.relations.pop();
    },
    (x) => {
      x.acquisition.relations[0].url = "https://www.wowhead.com/classic/quest=8912/name";
    },
  ];
  for (const mutate of mutations) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractWarriorHeroismRules(changed));
  }
});

test("unresolved current item metadata or a substituted alternate item cannot enter the catalog", () => {
  for (const mutate of [
    (x) => {
      x.normalized.items[0].setId = 1778;
    },
    (x) => {
      x.tables.ItemSparse[0].RequiredSkill = 164;
    },
    (x) => {
      x.normalized.items[0].issues.push("unresolved");
    },
    (x) => {
      x.tables.ItemSparse[0].Bonding = 2;
    },
  ]) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extendWarriorHeroismCatalog({ items: [] }, changed));
  }
});

test("actual frozen dispatch routes set 511 once while preserving the Valor and dungeon-mana hooks", () => {
  const patched = applyWarriorHeroismDispatch(evidence.engine);
  assert(patched.itemSets.includes("character.kfcValorBonuses()..."));
  assert(patched.itemSets.includes("character.kfcForeverDungeonManaBonuses()..."));
  assert.equal(patched.itemSets.split("character.kfcHeroismBonuses()...").length, 2);
  assert(patched.foreverSets.includes("id == 511 || (exists && !isForeverTier1EquipmentSet(id))"));
  assert.throws(() => applyWarriorHeroismDispatch(patched));
});
