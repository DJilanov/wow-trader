import assert from "node:assert/strict";
import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";

export const paladinSoulforgeItemIds = Object.freeze(
  Array.from({ length: 8 }, (_, index) => 22086 + index),
);
function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

/** Preserve the base set and Alliance class-quest provenance without merging same-named variants.
 * @param {object} evidence @returns {object}
 */
export function extractPaladinSoulforgeRules(evidence) {
  assert.equal(evidence.schema, "kfc-paladin-soulforge-client-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(
    evidence.source.normalizedSha256,
    "e00c4897f5278e4dca9ac834adacfd4da07e61a2ca4382f881f2f6785faeefe7",
  );
  const set = one(evidence.normalized.sets, (row) => row.id === 516, "base Soulforge");
  assert.equal(set.Name_lang, "Soulforge Armor");
  assert.deepEqual(
    set.ItemID.filter(Boolean).sort((a, b) => a - b),
    [...paladinSoulforgeItemIds],
  );
  assert.deepEqual([set.RequiredSkill, set.RequiredSkillRank, set.SetFlags], [0, 0, 0]);
  const links = evidence.normalized.setEffects.filter((row) => row.ItemSetID === 516);
  assert.deepEqual(
    links,
    evidence.tables.ItemSetSpell.filter((row) => row.ItemSetID === 516),
  );
  assert.deepEqual(
    links.map((row) => [row.Threshold, row.SpellID]).sort((a, b) => a[0] - b[0]),
    [
      [2, 18679],
      [4, 27498],
      [6, 14049],
      [8, 14803],
    ],
  );
  for (const row of links) assert.deepEqual([row.ChrSpecID, row.TraitSubTreeID], [0, 0]);
  for (const [id, signatures] of [
    [18679, [[6, 22, 8, [126, 0], 0]]],
    [
      14049,
      [
        [6, 99, 40, [0, 0], 0],
        [6, 124, 40, [0, 0], 0],
      ],
    ],
    [14803, [[6, 674, 200, [1, 0], 0]]],
    [27498, [[6, 42, 1, [0, 0], 27499]]],
    [
      27499,
      [
        [6, 13, 65, [126, 0], 0],
        [6, 135, 65, [126, 0], 0],
      ],
    ],
  ]) {
    const effects = evidence.tables.SpellEffect.filter((row) => row.SpellID === id).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    assert.deepEqual(
      effects.map((row) => [
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectMiscValue,
        row.EffectTriggerSpell,
      ]),
      signatures,
    );
    for (const row of effects) {
      assert.deepEqual(row.ImplicitTarget, [1, 0]);
      assert.deepEqual(row.EffectSpellClassMask, [0, 0, 0, 0]);
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
      ])
        assert.equal(row[key], 0);
    }
  }
  const proc = one(
    evidence.tables.SpellAuraOptions,
    (row) => row.SpellID === 27498,
    "Soulforge melee proc",
  );
  assert.deepEqual(proc.ProcTypeMask, [4, 0]);
  const acquisition = evidence.acquisition;
  assert.equal(acquisition.schema, "kfc-paladin-soulforge-acquisition-review.v1");
  assert.deepEqual(
    [
      acquisition.setId,
      acquisition.excludedVariantSetId,
      acquisition.obtainableClass,
      acquisition.gameClassMask,
      acquisition.faction,
    ],
    [516, 1673, 4, 2, "Alliance"],
  );
  assert.equal(acquisition.currentServerAcquisitionVerified, false);
  assert.equal(acquisition.relations.length, 4);
  assert.equal(evidence.questEvidence.length, 4);
  const rewards = [];
  for (const relation of acquisition.relations) {
    const quest = one(
      evidence.questEvidence,
      (row) => row.questId === relation.questId,
      "Paladin upgrade quest",
    );
    assert.deepEqual(
      [quest.className, quest.requiredClasses, quest.requiredRaces, quest.requiredLevel],
      ["Paladin", 2, 77, 58],
    );
    assert(relation.requiredLightforgeIds.every((id) => quest.requiredItemIds.includes(id)));
    assert.equal(relation.requiredLightforgeIds.length, relation.rewardIds.length);
    assert.equal(relation.rewardDelivery, "all-listed-items");
    const url = new URL(relation.url);
    assert.equal(url.origin, "https://www.wowhead.com");
    assert(new RegExp("^/forever/(?:de/)?quest=" + relation.questId + "/").test(url.pathname));
    for (const id of relation.rewardIds) {
      assert(paladinSoulforgeItemIds.includes(id));
      const baked = one(
        evidence.itemRewardEvidence,
        (row) => row.id === id,
        "same-TOC item reward",
      );
      assert.deepEqual(baked.questRewards, [relation.questId]);
      rewards.push(id);
    }
  }
  assert.deepEqual(
    rewards.sort((a, b) => a - b),
    [...paladinSoulforgeItemIds],
  );
  return {
    schema: "kfc-paladin-soulforge-rules.v1",
    setId: 516,
    excludedVariant: 1673,
    resistancesAtTwo: 8,
    attackPowerAtSix: 40,
    rangedAttackPowerAtSix: 40,
    bonusArmorAtEight: 200,
    fourPiece: {
      spellId: 27498,
      triggerSpellId: 27499,
      spellPower: 65,
      procTypeMask: [4, 0],
      scope: "inactive in declared healing-only workloads without melee attacks",
    },
    currentServerAcquisitionVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** @param {object} parent @param {object} evidence @returns {object} */
export function extendPaladinSoulforgeCatalog(parent, evidence) {
  const rules = extractPaladinSoulforgeRules(evidence),
    db = structuredClone(parent),
    additions = [],
    sources = [];
  const ratings = currentLevel60Ratings(evidence.ratings),
    sets = new Map(evidence.normalized.sets.map((row) => [row.id, row]));
  for (const id of paladinSoulforgeItemIds) {
    assert(!parent.items.some((row) => row.id === id), "Refusing to replace Soulforge item " + id);
    const current = one(
      evidence.normalized.items,
      (row) => row.itemId === id,
      "current Soulforge item",
    );
    const sparse = one(
      evidence.tables.ItemSparse,
      (row) => row.id === id,
      "current Soulforge metadata",
    );
    const historical = one(evidence.historical, (row) => row.id === id, "Soulforge icon");
    assert.deepEqual(
      [current.classId, current.subclassId, current.setId, sparse.Bonding],
      [4, 4, 516, 1],
    );
    assert.deepEqual(current.effectIds, []);
    const item = normalizeCurrentPrebisItem(current, sparse, historical, ratings, sets);
    item.classAllowlist = [4];
    item.factionRestriction = 1;
    db.items.push(item);
    additions.push(item);
    const relation = one(
      evidence.acquisition.relations,
      (row) => row.rewardIds.includes(id),
      "Soulforge reward relation",
    );
    sources.push({
      id,
      name: item.name,
      requiredLevel: 58,
      sources: [
        {
          kind: "dungeon-quest",
          faction: "Alliance",
          quests: [{ id: relation.questId, url: relation.url, rewardDelivery: "all-listed-items" }],
        },
      ],
      acquisition: {
        kind: "dungeon-set-upgrade",
        obtainableClass: 4,
        binding: "pickup",
        currentServerVerified: false,
      },
      status: "current-client-reviewed-quest-acquisition-provisional",
    });
  }
  assert.deepEqual(db.items.slice(0, parent.items.length), parent.items);
  return {
    db,
    additions,
    sources,
    rules,
    requiresEffectAdmission: true,
    numericalReuseAllowed: false,
    publicationAllowed: false,
  };
}

/** @param {{implementation:string,rules:object}} input @returns {string} */
export function renderPaladinSoulforge({ implementation, rules }) {
  assert.equal(rules.schema, "kfc-paladin-soulforge-rules.v1");
  assert.equal(implementation.split("// KFC_PALADIN_SOULFORGE_VALUES").length, 2);
  return implementation.replace(
    "// KFC_PALADIN_SOULFORGE_VALUES",
    `const kfcSoulforgeResistances = ${rules.resistancesAtTwo}\nconst kfcSoulforgeAttackPower = ${rules.attackPowerAtSix}\nconst kfcSoulforgeBonusArmor = ${rules.bonusArmorAtEight}`,
  );
}
