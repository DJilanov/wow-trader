import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { eligiblePrebis, prebisSlotTypes } from "./prebis-pool.mjs";
import { applyWarriorHeroismDispatch } from "./warrior-heroism-model.mjs";
import {
  applyRogueDarkmantleDispatch,
  extendRogueDarkmantleCatalog,
  extendRogueDarkmantleInspection,
  extractRogueDarkmantleRules,
  rogueDarkmantleItemIds,
} from "./rogue-darkmantle-model.mjs";

const evidence = JSON.parse(
  gunzipSync(
    await readFile(new URL("./fixtures/rogue-darkmantle-source.v1.json.gz", import.meta.url)),
  ),
);

test("base Darkmantle has exact 2/4/6/8 bonuses and a disclosed inherited proc cadence", () => {
  const r = extractRogueDarkmantleRules(evidence);
  assert.deepEqual(
    [
      r.setId,
      r.resistancesAtTwo,
      r.energyAtFour,
      r.attackPowerAtSix,
      r.rangedAttackPowerAtSix,
      r.bonusArmorAtEight,
    ],
    [512, 8, 20, 40, 40, 200],
  );
  assert.equal(r.proc.energySpellId, 27788);
  assert.equal(r.proc.whiteMeleeOnly, true);
  assert.equal(r.proc.inheritedReferencePpm, 1);
  assert.equal(r.proc.serverCadenceVerified, false);
  assert.equal(r.currentServerAcquisitionVerified, false);
});

test("all eight pieces preserve current stats, acquisition restrictions and explicit boots utility", () => {
  const parent = { items: [{ id: 25, name: "Parent sentinel" }], enchants: [] },
    before = globalThis.structuredClone(parent),
    sourceBefore = globalThis.structuredClone(evidence),
    result = extendRogueDarkmantleCatalog(parent, evidence);
  assert.deepEqual(parent, before);
  assert.deepEqual(evidence, sourceBefore);
  assert.deepEqual(result.db.items.slice(0, 1), parent.items);
  assert.deepEqual(
    result.additions.map((row) => row.id),
    [...rogueDarkmantleItemIds],
  );
  for (const item of result.additions) {
    assert.equal(item.setId, 512);
    assert.equal(item.armorType, 2);
    assert.deepEqual(item.classAllowlist, [6]);
    assert.equal(item.factionRestriction, undefined);
    const source = result.sources.find((row) => row.id === item.id);
    assert.deepEqual(source.sources[0].quests.map((row) => row.faction).sort(), [
      "Alliance",
      "Horde",
    ]);
    assert.equal(source.acquisition.currentServerVerified, false);
    assert.equal(source.utilityReview?.spellId, item.id === 22003 ? 27037 : undefined);
  }
  const boots = result.additions.find((row) => row.id === 22003),
    tunic = result.additions.find((row) => row.id === 22009);
  assert.equal(boots.stats[1], 24);
  assert.equal(boots.stats[26], 127);
  assert.equal(tunic.stats[18], 2);
  assert.equal(result.numericalReuseAllowed, false);
  assert.equal(result.publicationAllowed, false);
  assert.throws(() => extendRogueDarkmantleCatalog(result.db, evidence), /Refusing to replace/);
});

test("both factions retain all eight Rogue candidates while unrelated classes cannot acquire them", () => {
  const result = extendRogueDarkmantleCatalog({ items: [], enchants: [] }, evidence);
  for (const factionName of ["Alliance", "Horde"]) {
    const context = {
      requireCraftAudit: true,
      factionName,
      playerClass: 6,
      professions: [],
      currentIds: new Set(),
    };
    for (const item of result.additions) {
      const source = result.sources.find((row) => row.id === item.id),
        slot = prebisSlotTypes.indexOf(item.type);
      assert.equal(eligiblePrebis(item, source, context, slot), true);
      assert.equal(eligiblePrebis(item, source, { ...context, playerClass: 1 }, slot), false);
    }
  }
});

test("inspection preserves guaranteed rewards, utility disclosure and unrelated metadata", () => {
  const parent = { items: { 25: { setId: 0 } }, sets: { 189: { name: "Valor sentinel" } } },
    before = globalThis.structuredClone(parent),
    result = extendRogueDarkmantleInspection(parent, evidence);
  assert.deepEqual(parent, before);
  assert.deepEqual(result.items[25], parent.items[25]);
  assert.deepEqual(result.sets[189], parent.sets[189]);
  assert.deepEqual(
    result.sets[512].effects.map((row) => row.threshold),
    [2, 4, 6, 8],
  );
  for (const id of rogueDarkmantleItemIds) {
    assert.equal(result.items[id].questRewardOnce, true);
    assert.deepEqual(result.items[id].questChoices, []);
    assert.equal(result.items[id].effects.length, id === 22003 ? 1 : 0);
  }
  assert.match(result.items[22003].effects[0].scope, /without stealth-detection/);
  assert.throws(() => extendRogueDarkmantleInspection(result, evidence), /Refusing to replace/);
});

test("changed resource payloads, masks, utility, binding and class/reward evidence fail closed", () => {
  const mutations = [
    (x) => {
      x.tables.SpellEffect.find((row) => row.SpellID === 27788).EffectBasePointsF = 35;
    },
    (x) => {
      x.tables.SpellEffect.find((row) => row.SpellID === 27788).EffectMiscValue[0] = 0;
    },
    (x) => {
      x.tables.SpellEffect.find((row) => row.SpellID === 27037).EffectAura = 99;
    },
    (x) => {
      x.tables.SpellEffect.find((row) => row.SpellID === 14049).Coefficient = 1;
    },
    (x) => {
      x.tables.SpellAuraOptions.find((row) => row.SpellID === 27787).ProcTypeMask[0] = 20;
    },
    (x) => {
      x.normalized.items.find((row) => row.itemId === 22003).effectIds.push(999);
    },
    (x) => {
      x.normalized.items[0].setId = 1676;
    },
    (x) => {
      x.tables.ItemSparse[0].Bonding = 2;
    },
    (x) => {
      x.acquisition.relations.pop();
    },
    (x) => {
      x.classQuestEvidence[0].requiredClasses = 1;
    },
    (x) => {
      x.acquisition.relations[0].url = "https://www.wowhead.com/classic/quest=8910/name";
    },
    (x) => {
      x.acquisition.rewardDelivery = "choose-one";
    },
  ];
  for (const mutate of mutations) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extendRogueDarkmantleCatalog({ items: [] }, changed));
  }
});

test("dispatch is base-ID scoped, suppresses duplicate static bonuses and composes in either Heroism order", () => {
  const before = globalThis.structuredClone(evidence.engine),
    direct = applyRogueDarkmantleDispatch(evidence.engine),
    heroismFirst = applyRogueDarkmantleDispatch(applyWarriorHeroismDispatch(evidence.engine)),
    darkmantleFirst = applyWarriorHeroismDispatch(direct);
  assert.deepEqual(evidence.engine, before);
  for (const source of [direct, heroismFirst, darkmantleFirst]) {
    assert.equal(source.itemSets.split("character.kfcDarkmantleBonuses()").length, 2);
    assert.match(source.foreverSets, /if id == 512 \{ continue \}/);
    assert.match(source.foreverSets, /if id == 512 \{ return true \}/);
  }
  for (const source of [heroismFirst, darkmantleFirst])
    assert.equal(source.itemSets.split("character.kfcHeroismBonuses()").length, 2);
  assert.throws(() => applyRogueDarkmantleDispatch(direct));
  assert.throws(() =>
    applyRogueDarkmantleDispatch({
      ...evidence.engine,
      foreverSets: evidence.engine.foreverSets.replace(
        "func overridesForeverEquipmentSet",
        "func renamedOverride",
      ),
    }),
  );
});
