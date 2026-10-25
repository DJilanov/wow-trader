import assert from "node:assert/strict";
import { URL } from "node:url";
import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";

export const warriorHeroismItemIds = Object.freeze(
  Array.from({ length: 8 }, (_, index) => 21994 + index),
);
const one = (rows, predicate, label) => {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, "Missing or ambiguous " + label);
  return matches[0];
};

/** Validate the base set separately from the identically named alternate set.
 * @param {object} evidence @returns {object}
 */
export function extractWarriorHeroismRules(evidence) {
  assert.equal(evidence.schema, "kfc-warrior-heroism-client-source.v1");
  assert.equal(evidence.normalized.schema, "forever-client-mechanics.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.normalized.clientVersion, evidence.source.build.clientVersion);
  assert.equal(evidence.normalized.hotfixSha256, evidence.source.hotfixSha256);
  const set = one(evidence.normalized.sets, (row) => row.id === 511, "base Heroism set");
  assert.equal(set.Name_lang, "Battlegear of Heroism");
  assert.deepEqual(
    set.ItemID.filter(Boolean).sort((a, b) => a - b),
    [...warriorHeroismItemIds],
  );
  assert.equal(set.RequiredSkill, 0);
  assert.equal(set.RequiredSkillRank, 0);
  const thresholds = evidence.normalized.setEffects.filter((row) => row.ItemSetID === 511);
  assert.deepEqual(
    thresholds,
    evidence.tables.ItemSetSpell.filter((row) => row.ItemSetID === 511),
  );
  assert.deepEqual(
    thresholds.map((row) => [row.Threshold, row.SpellID]).sort((a, b) => a[0] - b[0]),
    [
      [2, 18679],
      [4, 27419],
      [6, 14049],
      [8, 14803],
    ],
  );
  const effects = (spell) =>
      evidence.tables.SpellEffect.filter((row) => row.SpellID === spell).sort(
        (a, b) => a.EffectIndex - b.EffectIndex,
      ),
    compact = (row) => [
      row.Effect,
      row.EffectAura,
      row.EffectBasePointsF,
      row.EffectMiscValue,
      row.EffectTriggerSpell,
      row.Variance,
      row.ImplicitTarget,
    ];
  assert.deepEqual(effects(18679).map(compact), [[6, 22, 8, [126, 0], 0, 0, [1, 0]]]);
  assert.deepEqual(effects(14049).map(compact), [
    [6, 99, 40, [0, 0], 0, 0, [1, 0]],
    [6, 124, 40, [0, 0], 0, 0, [1, 0]],
  ]);
  assert.deepEqual(effects(14803).map(compact), [[6, 674, 200, [1, 0], 0, 0, [1, 0]]]);
  assert.deepEqual(effects(27419).map(compact), [[6, 42, 0, [0, 0], 27418, 0, [1, 0]]]);
  assert.deepEqual(effects(27418).map(compact), [[10, 0, 110, [0, 0], 0, 0.4, [1, 0]]]);
  for (const row of evidence.tables.SpellEffect) {
    for (const field of [
      "DifficultyID",
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
    ])
      assert.equal(row[field], 0, "Unreviewed Heroism effect field " + field);
    assert.deepEqual(row.EffectSpellClassMask, [0, 0, 0, 0]);
    assert.equal(row.EffectBonusCoefficient, row.SpellID === 27419 ? 1 : 0);
    assert.equal(row.GroupSizeBasePointsCoefficient, 1);
    assert.equal(row.EffectChainAmplitude, 1);
    assert.equal(row.PvpMultiplier, 1);
  }
  const proc = one(
    evidence.tables.SpellAuraOptions,
    (row) => row.SpellID === 27419,
    "base Heroism proc",
  );
  assert.deepEqual(
    [
      proc.DifficultyID,
      proc.CumulativeAura,
      proc.ProcCategoryRecovery,
      proc.ProcChance,
      proc.ProcCharges,
      proc.SpellProcsPerMinuteID,
      proc.ProcTypeMask,
    ],
    [0, 0, 0, 100, 0, 0, [4, 0]],
  );
  assert.equal(evidence.acquisition.schema, "kfc-warrior-heroism-reviewed-acquisition.v1");
  assert.equal(evidence.acquisition.setId, 511);
  assert.equal(evidence.acquisition.obtainableClass, 9);
  assert.equal(evidence.acquisition.currentServerAcquisitionVerified, false);
  for (const faction of ["Alliance", "Horde"]) {
    const relations = evidence.acquisition.relations.filter((row) => row.faction === faction);
    assert.equal(relations.length, 4);
    assert.deepEqual(
      relations.flatMap((row) => row.rewardIds).sort((a, b) => a - b),
      [...warriorHeroismItemIds],
    );
    for (const relation of relations) {
      const url = new URL(relation.url);
      assert.equal(url.origin, "https://www.wowhead.com");
      assert(new RegExp("^/forever/(?:it/)?quest=" + relation.questId + "/").test(url.pathname));
      assert.equal(relation.requiredValorIds.length, relation.rewardIds.length);
    }
  }
  return {
    schema: "kfc-warrior-heroism-rules.v1",
    setId: 511,
    resistancesAtTwo: 8,
    attackPowerAtSix: 40,
    rangedAttackPowerAtSix: 40,
    bonusArmorAtEight: 200,
    proc: {
      threshold: 4,
      spellId: 27419,
      healSpellId: 27418,
      minimumHealing: 88,
      maximumHealing: 132,
      rage: 0,
      whiteMeleeOnly: true,
      inheritedReferencePpm: 1,
      serverCadenceVerified: false,
    },
    excludedVariant: 1778,
    currentServerAcquisitionVerified: false,
    publicationAllowed: false,
  };
}

/** Append the eight reviewed quest rewards without changing existing records or inheriting scores.
 * @param {object} parent @param {object} evidence @returns {object}
 */
export function extendWarriorHeroismCatalog(parent, evidence) {
  const rules = extractWarriorHeroismRules(evidence),
    before = JSON.stringify(parent),
    db = globalThis.structuredClone(parent),
    sources = [],
    additions = [],
    coefficients = currentLevel60Ratings(evidence.ratings),
    sets = new Map(evidence.normalized.sets.map((row) => [row.id, row]));
  assert.equal(new Set(parent.items.map((row) => row.id)).size, parent.items.length);
  for (const id of warriorHeroismItemIds) {
    assert(
      !parent.items.some((row) => row.id === id),
      "Refusing to replace existing Heroism item " + id,
    );
    const current = one(
        evidence.normalized.items,
        (row) => row.itemId === id,
        "current item " + id,
      ),
      sparse = one(evidence.tables.ItemSparse, (row) => row.id === id, "ItemSparse " + id),
      historical = one(evidence.historical, (row) => row.id === id, "historical icon " + id);
    assert.equal(current.setId, 511);
    assert.deepEqual(current.effectIds, []);
    assert.equal(current.classId, 4);
    assert.equal(current.subclassId, 4);
    assert.equal(sparse.Bonding, 1);
    assert.deepEqual(historical.classAllowlist, [9]);
    const item = normalizeCurrentPrebisItem(current, sparse, historical, coefficients, sets);
    // Sparse wear flags are unrestricted; the BoP class quest supplies the acquisition restriction.
    item.classAllowlist = [9];
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
        obtainableClass: 9,
        binding: "pickup",
        currentServerVerified: false,
        evidence:
          "Forever quest database and announced dungeon-set questline; no observed server reward",
      },
      status: "current-client-reviewed-quest-acquisition-provisional",
      notes: [
        "Base set 511 only. Alternate set 1778 is excluded. Proc cadence remains server-unverified.",
      ],
    });
  }
  assert.equal(JSON.stringify(parent), before);
  assert.deepEqual(db.items.slice(0, parent.items.length), parent.items);
  return { db, additions, sources, rules, numericalReuseAllowed: false, publicationAllowed: false };
}

/** Add the same set and ownership metadata to inspection without replacing existing records.
 * @param {object} parent @param {object} evidence @returns {object}
 */
export function extendWarriorHeroismInspection(parent, evidence) {
  extractWarriorHeroismRules(evidence);
  const result = globalThis.structuredClone(parent);
  assert.equal(result.sets[511], undefined, "Refusing to replace existing Heroism inspection");
  const names = new Map([
    [2, "+8 to all resistances"],
    [4, "Chance to restore health on a melee attack"],
    [6, "+40 attack power"],
    [8, "+200 armor"],
  ]);
  result.sets[511] = {
    name: "Battlegear of Heroism",
    effects: evidence.normalized.setEffects
      .filter((row) => row.ItemSetID === 511)
      .map((row) => ({
        threshold: row.Threshold,
        spellId: row.SpellID,
        name: names.get(row.Threshold),
      }))
      .sort((a, b) => a.threshold - b.threshold),
  };
  for (const id of warriorHeroismItemIds) {
    assert.equal(
      result.items[id],
      undefined,
      "Refusing to replace existing Heroism item inspection",
    );
    const sparse = one(
      evidence.tables.ItemSparse,
      (row) => row.id === id,
      "inspection ItemSparse " + id,
    );
    result.items[id] = {
      setId: 511,
      binding: sparse.Bonding,
      requiredLevel: sparse.RequiredLevel,
      effects: [],
      limitCategory: 0,
      questRewardOnce: true,
      questChoices: [],
    };
  }
  return result;
}

/** Route only Forever set 511 through its explicit effects; preserve the frozen legacy source.
 * @param {{itemSets: string, foreverSets: string}} source @returns {{itemSets: string, foreverSets: string}}
 */
export function applyWarriorHeroismDispatch(source) {
  const replace = (text, anchor, replacement) => {
    assert.equal(text.split(anchor).length, 2, "Missing or repeated Heroism dispatch anchor");
    return text.replace(anchor, replacement);
  };
  assert(!source.itemSets.includes("kfcHeroismBonuses"));
  assert(!source.foreverSets.includes("kfcHeroismBonusSupported"));
  return {
    itemSets: replace(
      source.itemSets,
      "activeBonuses = append(activeBonuses, character.kfcValorBonuses()...)",
      "activeBonuses = append(activeBonuses, character.kfcValorBonuses()...)\n\t\tactiveBonuses = append(activeBonuses, character.kfcHeroismBonuses()...)",
    ),
    foreverSets: replace(
      replace(
        source.foreverSets,
        "|| kfcForeverDungeonManaBonusSupported(id, pieces)",
        "|| kfcForeverDungeonManaBonusSupported(id, pieces) || kfcHeroismBonusSupported(id, pieces)",
      ),
      "return exists && !isForeverTier1EquipmentSet(id)",
      "return id == 511 || (exists && !isForeverTier1EquipmentSet(id))",
    ),
  };
}
