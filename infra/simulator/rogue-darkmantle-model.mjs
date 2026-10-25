import assert from "node:assert/strict";
import { URL } from "node:url";
import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";

export const rogueDarkmantleItemIds = Object.freeze(Array.from({ length: 8 }, (_, i) => 22002 + i));
const one = (rows, predicate, label) => {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
};

/** Validate base set 512, its quest-class restrictions and the boots' utility effect.
 * @param {object} evidence @returns {object}
 */
export function extractRogueDarkmantleRules(evidence) {
  assert.equal(evidence.schema, "kfc-rogue-darkmantle-client-source.v1");
  assert.equal(evidence.normalized.schema, "forever-client-mechanics.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.normalized.clientVersion, evidence.source.build.clientVersion);
  assert.equal(evidence.normalized.hotfixSha256, evidence.source.hotfixSha256);
  const set = one(evidence.normalized.sets, (row) => row.id === 512, "base Darkmantle set");
  assert.equal(set.Name_lang, "Darkmantle Armor");
  assert.deepEqual(
    set.ItemID.filter(Boolean).sort((a, b) => a - b),
    [...rogueDarkmantleItemIds],
  );
  assert.equal(set.RequiredSkill, 0);
  assert.equal(set.RequiredSkillRank, 0);
  const links = evidence.normalized.setEffects.filter((row) => row.ItemSetID === 512);
  assert.deepEqual(
    links,
    evidence.tables.ItemSetSpell.filter((row) => row.ItemSetID === 512),
  );
  assert.deepEqual(
    links.map((row) => [row.Threshold, row.SpellID]).sort((a, b) => a[0] - b[0]),
    [
      [2, 18679],
      [4, 27787],
      [6, 14049],
      [8, 14803],
    ],
  );
  for (const row of links) assert.deepEqual([row.ChrSpecID, row.TraitSubTreeID], [0, 0]);
  for (const [spellId, signatures] of [
    [18679, [[6, 22, 8, [126, 0], 0, 0]]],
    [
      14049,
      [
        [6, 99, 40, [0, 0], 0, 0],
        [6, 124, 40, [0, 0], 0, 0],
      ],
    ],
    [14803, [[6, 674, 200, [1, 0], 0, 0]]],
    [27787, [[6, 42, 1, [0, 0], 27788, 0]]],
    [27788, [[30, 0, 20, [3, 0], 0, 1]]],
    [27037, [[6, 154, 8, [0, 0], 0, 0]]],
  ]) {
    const rows = evidence.tables.SpellEffect.filter((row) => row.SpellID === spellId).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    assert.deepEqual(
      rows.map((row) => [
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectMiscValue,
        row.EffectTriggerSpell,
        row.EffectBonusCoefficient,
      ]),
      signatures,
    );
    for (const row of rows) {
      assert.deepEqual(row.ImplicitTarget, [1, 0]);
      assert.deepEqual(row.EffectSpellClassMask, [0, 0, 0, 0]);
      assert.deepEqual(row.EffectRadiusIndex, [0, 0]);
      for (const key of [
        "DifficultyID",
        "Variance",
        "ScalingClass",
        "EffectRealPointsPerLevel",
        "EffectPointsPerResource",
        "Coefficient",
        "BonusCoefficientFromAP",
        "ResourceCoefficient",
        "EffectAuraPeriod",
        "EffectAttributes",
        "EffectMechanic",
        "EffectChainTargets",
        "EffectAmplitude",
        "EffectItemType",
      ])
        assert.equal(row[key], 0, "Unreviewed Darkmantle effect field " + key);
      for (const key of ["GroupSizeBasePointsCoefficient", "EffectChainAmplitude", "PvpMultiplier"])
        assert.equal(row[key], 1);
    }
  }
  const proc = one(
    evidence.tables.SpellAuraOptions,
    (row) => row.SpellID === 27787,
    "Darkmantle proc",
  );
  assert.deepEqual(
    [
      proc.DifficultyID,
      proc.ProcChance,
      proc.ProcCharges,
      proc.ProcCategoryRecovery,
      proc.SpellProcsPerMinuteID,
      proc.CumulativeAura,
      proc.ProcTypeMask,
    ],
    [0, 100, 0, 0, 0, 0, [4, 0]],
  );
  assert.equal(evidence.tables.SpellAuraOptions.filter((row) => row.SpellID === 27037).length, 0);
  const bootEffect = one(
    evidence.tables.ItemEffect,
    (row) => row.id === 103242,
    "boots ItemEffect",
  );
  assert.equal(evidence.tables.ItemEffect.length, 1);
  assert.deepEqual(
    [
      bootEffect.TriggerType,
      bootEffect.Charges,
      bootEffect.CoolDownMSec,
      bootEffect.CategoryCoolDownMSec,
      bootEffect.SpellCategoryID,
      bootEffect.SpellID,
      bootEffect.ChrSpecializationID,
      bootEffect.PlayerConditionID,
    ],
    [1, 0, -1, -1, 0, 27037, 0, 0],
  );
  assert.equal(evidence.tables.ItemXItemEffect.length, 1);
  assert.deepEqual(
    evidence.tables.ItemXItemEffect.map((row) => [row.ItemID, row.ItemEffectID]),
    [[22003, 103242]],
  );
  const acquisition = evidence.acquisition;
  assert.equal(acquisition.schema, "kfc-rogue-darkmantle-reviewed-acquisition.v1");
  assert.equal(acquisition.setId, 512);
  assert.equal(acquisition.obtainableClass, 6);
  assert.equal(acquisition.requiredClassMask, 8);
  assert.equal(acquisition.currentServerAcquisitionVerified, false);
  assert.equal(
    acquisition.rewardDelivery,
    "all-listed-items; database says receive rather than choose",
  );
  assert.equal(acquisition.relations.length, 8);
  assert.equal(evidence.classQuestEvidence.length, 8);
  assert.equal(new Set(acquisition.relations.map((row) => row.questId)).size, 8);
  for (const faction of ["Alliance", "Horde"]) {
    const rows = acquisition.relations.filter((row) => row.faction === faction);
    assert.equal(rows.length, 4);
    assert.deepEqual(
      rows.flatMap((row) => row.rewardIds).sort((a, b) => a - b),
      [...rogueDarkmantleItemIds],
    );
    for (const relation of rows) {
      const quest = one(
          evidence.classQuestEvidence,
          (row) => row.questId === relation.questId,
          "class quest",
        ),
        url = new URL(relation.url);
      assert.equal(quest.requiredClasses, 8);
      assert.equal(quest.className, "Rogue");
      assert(relation.requiredBaseIds.every((id) => quest.requiredItemIds.includes(id)));
      assert.equal(relation.requiredBaseIds.length, relation.rewardIds.length);
      assert.equal(url.origin, "https://www.wowhead.com");
      assert(new RegExp("^/forever/(?:it/)?quest=" + relation.questId + "/").test(url.pathname));
      for (const id of relation.rewardIds) {
        const item = one(evidence.normalized.items, (row) => row.itemId === id, "reward " + id);
        assert.equal(item.setId, 512);
        assert.equal(item.name, acquisition.rewardNames[id]);
      }
    }
  }
  return {
    schema: "kfc-rogue-darkmantle-rules.v1",
    setId: 512,
    resistancesAtTwo: 8,
    energyAtFour: 20,
    attackPowerAtSix: 40,
    rangedAttackPowerAtSix: 40,
    bonusArmorAtEight: 200,
    proc: {
      spellId: 27787,
      energySpellId: 27788,
      whiteMeleeOnly: true,
      inheritedReferencePpm: 1,
      serverCadenceVerified: false,
    },
    bootsUtility: {
      itemId: 22003,
      itemEffectId: 103242,
      spellId: 27037,
      stealthLevel: 8,
      contributionScope:
        "No contribution in stationary boss encounters without stealth-detection mechanics; utility is disclosed, not implemented as damage.",
    },
    excludedVariant: 1676,
    currentServerAcquisitionVerified: false,
    publicationAllowed: false,
  };
}

/** Prepare all eight class-quest rewards, preserving parent records and explicit utility evidence.
 * @param {object} parent @param {object} evidence @returns {object}
 */
export function extendRogueDarkmantleCatalog(parent, evidence) {
  const rules = extractRogueDarkmantleRules(evidence),
    db = globalThis.structuredClone(parent),
    additions = [],
    sources = [],
    coefficients = currentLevel60Ratings(evidence.ratings),
    sets = new Map(evidence.normalized.sets.map((row) => [row.id, row]));
  assert.equal(new Set(parent.items.map((row) => row.id)).size, parent.items.length);
  for (const id of rogueDarkmantleItemIds) {
    assert(
      !parent.items.some((row) => row.id === id),
      "Refusing to replace existing Darkmantle item " + id,
    );
    const current = one(
        evidence.normalized.items,
        (row) => row.itemId === id,
        "current item " + id,
      ),
      sparse = one(evidence.tables.ItemSparse, (row) => row.id === id, "ItemSparse " + id),
      historical = one(evidence.historical, (row) => row.id === id, "icon " + id);
    assert.equal(current.setId, 512);
    assert.equal(current.classId, 4);
    assert.equal(current.subclassId, 2);
    assert.equal(sparse.Bonding, 1);
    assert.deepEqual(current.effectIds, id === 22003 ? [103242] : []);
    // The validated boots effect changes stealth detection, outside this encounter's mechanics.
    const statsOnly = id === 22003 ? { ...current, effectIds: [] } : current,
      item = normalizeCurrentPrebisItem(statsOnly, sparse, historical, coefficients, sets);
    item.classAllowlist = [6];
    additions.push(item);
    db.items.push(item);
    const quests = evidence.acquisition.relations
      .filter((row) => row.rewardIds.includes(id))
      .map((row) => ({ id: row.questId, faction: row.faction, url: row.url }));
    sources.push({
      id,
      name: current.name,
      requiredLevel: current.requiredLevel,
      sources: [{ kind: "dungeon-quest", quests }],
      acquisition: {
        kind: "dungeon-set-upgrade",
        obtainableClass: 6,
        binding: "pickup",
        currentServerVerified: false,
      },
      ...(id === 22003 ? { utilityReview: rules.bootsUtility } : {}),
      status: "current-client-reviewed-quest-acquisition-provisional",
      notes: [
        "Base set 512 only. Alternate set 1676 is excluded. Proc cadence and server acquisition remain unobserved.",
      ],
    });
  }
  assert.deepEqual(db.items.slice(0, parent.items.length), parent.items);
  return { db, additions, sources, rules, numericalReuseAllowed: false, publicationAllowed: false };
}

/** Prepare exact set/ownership metadata without treating guaranteed rewards as exclusive choices.
 * @param {object} parent @param {object} evidence @returns {object}
 */
export function extendRogueDarkmantleInspection(parent, evidence) {
  const rules = extractRogueDarkmantleRules(evidence),
    result = globalThis.structuredClone(parent);
  assert.equal(result.sets[512], undefined, "Refusing to replace existing Darkmantle inspection");
  const names = new Map([
    [2, "+8 to all resistances"],
    [4, "Melee auto attacks can restore 20 energy"],
    [6, "+40 attack power"],
    [8, "+200 armor"],
  ]);
  result.sets[512] = {
    name: "Darkmantle Armor",
    effects: evidence.normalized.setEffects
      .filter((row) => row.ItemSetID === 512)
      .map((row) => ({
        threshold: row.Threshold,
        spellId: row.SpellID,
        name: names.get(row.Threshold),
      }))
      .sort((a, b) => a.threshold - b.threshold),
  };
  for (const id of rogueDarkmantleItemIds) {
    assert.equal(
      result.items[id],
      undefined,
      "Refusing to replace existing Darkmantle item inspection",
    );
    const sparse = one(evidence.tables.ItemSparse, (row) => row.id === id, "inspection ItemSparse");
    result.items[id] = {
      setId: 512,
      binding: sparse.Bonding,
      requiredLevel: sparse.RequiredLevel,
      effects:
        id === 22003
          ? [
              {
                itemEffectId: 103242,
                spellId: 27037,
                status: "passive-utility-not-modeled",
                scope: rules.bootsUtility.contributionScope,
              },
            ]
          : [],
      limitCategory: 0,
      questRewardOnce: true,
      questChoices: [],
    };
  }
  return result;
}

/** Add a base-ID override that also composes with the independently prepared Heroism dispatch.
 * @param {{itemSets:string,foreverSets:string}} source @returns {{itemSets:string,foreverSets:string}}
 */
export function applyRogueDarkmantleDispatch(source) {
  const replace = (text, anchor, replacement) => {
    assert.equal(text.split(anchor).length, 2, "Missing or repeated Darkmantle dispatch anchor");
    return text.replace(anchor, replacement);
  };
  assert(!source.itemSets.includes("kfcDarkmantleBonuses"));
  assert(!source.foreverSets.includes("kfcDarkmantleBonusSupported"));
  return {
    itemSets: replace(
      source.itemSets,
      "activeBonuses = append(activeBonuses, character.kfcValorBonuses()...)",
      "activeBonuses = append(activeBonuses, character.kfcValorBonuses()...)\n\t\tactiveBonuses = append(activeBonuses, character.kfcDarkmantleBonuses()...)",
    ),
    foreverSets: replace(
      replace(
        replace(
          source.foreverSets,
          "func ForeverEquipmentBonusSupported(id, pieces int32) bool {",
          "func ForeverEquipmentBonusSupported(id, pieces int32) bool {\n\tif id == 512 { return kfcDarkmantleBonusSupported(id, pieces) }",
        ),
        "for _, id := range ids {\n\t\tset, exists := foreverEquipmentSets[id]",
        "for _, id := range ids {\n\t\tif id == 512 { continue }\n\t\tset, exists := foreverEquipmentSets[id]",
      ),
      "func overridesForeverEquipmentSet(id int32) bool {",
      "func overridesForeverEquipmentSet(id int32) bool {\n\tif id == 512 { return true }",
    ),
  };
}
