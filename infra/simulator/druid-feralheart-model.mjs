import assert from "node:assert/strict";
import { URL } from "node:url";
import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";

export const druidFeralheartItemIds = Object.freeze(
  Array.from({ length: 8 }, (_, index) => 22106 + index),
);
function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

/** Verify the exact base set and preserve the separately disclosed historical quest relation.
 * @param {object} evidence @returns {object}
 */
export function extractDruidFeralheartRules(evidence) {
  assert.equal(evidence.schema, "kfc-druid-feralheart-client-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.normalized.clientVersion, evidence.source.build.clientVersion);
  assert.equal(evidence.normalized.hotfixSha256, evidence.source.hotfixSha256);
  const set = one(evidence.normalized.sets, (row) => row.id === 513, "base Feralheart");
  assert.equal(set.Name_lang, "Feralheart Raiment");
  assert.deepEqual(
    set.ItemID.filter(Boolean).sort((a, b) => a - b),
    [...druidFeralheartItemIds],
  );
  assert.deepEqual([set.RequiredSkill, set.RequiredSkillRank, set.SetFlags], [0, 0, 0]);
  const links = evidence.normalized.setEffects.filter((row) => row.ItemSetID === 513);
  assert.deepEqual(
    links,
    evidence.tables.ItemSetSpell.filter((row) => row.ItemSetID === 513),
  );
  assert.deepEqual(
    links.map((row) => [row.Threshold, row.SpellID]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    [
      [2, 18679],
      [4, 27781],
      [6, 9334],
      [6, 9344],
      [8, 14803],
    ],
  );
  for (const row of links) assert.deepEqual([row.ChrSpecID, row.TraitSubTreeID], [0, 0]);
  for (const [id, signatures] of [
    [18679, [[6, 22, 8, [126, 0], 0, 0]]],
    [
      9334,
      [
        [6, 99, 26, [0, 0], 0, 0],
        [6, 124, 26, [0, 0], 0, 0],
      ],
    ],
    [
      9344,
      [
        [6, 13, 15, [126, 0], 0, 0],
        [6, 135, 15, [126, 0], 0, 1],
      ],
    ],
    [14803, [[6, 674, 200, [1, 0], 0, 0]]],
    [27781, [[6, 42, 0, [0, 0], 27798, 1]]],
    [27798, [[3, 0, 0, [0, 0], 0, 1]]],
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
        row.EffectBonusCoefficient,
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
    (row) => row.SpellID === 27781,
    "Feralheart proc",
  );
  assert.deepEqual(
    [
      proc.ProcChance,
      proc.ProcCategoryRecovery,
      proc.ProcCharges,
      proc.SpellProcsPerMinuteID,
      proc.ProcTypeMask,
    ],
    [2, 0, 0, 0, [40, 0]],
  );
  assert.equal(
    one(
      evidence.tables.Spell,
      (row) => row.id === 27781,
      "proc description",
    ).Description_lang.trim(),
    "When struck in combat has a chance of returning 300 mana, 10 rage, or 40 energy to the wearer.",
  );
  const acquisition = evidence.acquisition;
  assert.equal(acquisition.schema, "kfc-druid-feralheart-acquisition-review.v1");
  assert.deepEqual(
    [
      acquisition.setId,
      acquisition.obtainableClass,
      acquisition.gameClassMask,
      acquisition.excludedVariantSetId,
    ],
    [513, 1, 1024, 1667],
  );
  assert.equal(acquisition.currentServerAcquisitionVerified, false);
  assert.equal(acquisition.relations.length, 8);
  assert.equal(evidence.classQuestEvidence.length, 8);
  assert.equal(new Set(acquisition.relations.map((row) => row.questId)).size, 8);
  for (const faction of ["Alliance", "Horde"]) {
    const rows = acquisition.relations.filter((row) => row.faction === faction);
    assert.equal(rows.length, 4);
    assert.deepEqual(
      rows.flatMap((row) => row.rewardIds).sort((a, b) => a - b),
      [...druidFeralheartItemIds],
    );
    for (const relation of rows) {
      const quest = one(
          evidence.classQuestEvidence,
          (row) => row.questId === relation.questId,
          "Druid class quest",
        ),
        url = new URL(relation.url);
      assert.equal(quest.requiredClasses, 1024);
      assert.equal(quest.className, "Druid");
      assert.equal(quest.requiredRaces, faction === "Alliance" ? 77 : 178);
      assert.equal(relation.requiredClassMask, 1024);
      assert.equal(relation.requiredWildheartIds.length, relation.rewardIds.length);
      assert(relation.requiredWildheartIds.every((id) => quest.requiredItemIds.includes(id)));
      assert.equal(url.origin, "https://www.wowhead.com");
      const historical = relation.questId === 8913;
      assert(
        new RegExp(
          "^/" + (historical ? "classic" : "forever") + "/quest=" + relation.questId + "/",
        ).test(url.pathname),
      );
      assert.equal(relation.currentForeverRewardPageReviewed, !historical);
      assert.equal(relation.currentServerRewardObserved, false);
    }
  }
  return {
    schema: "kfc-druid-feralheart-rules.v1",
    setId: 513,
    excludedVariant: 1667,
    resistancesAtTwo: 8,
    spellDamageAtSix: 15,
    healingPowerAtSix: 15,
    attackPowerAtSix: 26,
    rangedAttackPowerAtSix: 26,
    bonusArmorAtEight: 200,
    proc: {
      threshold: 4,
      spellId: 27781,
      resourceSpellId: 27798,
      chance: 0.02,
      mana: 300,
      rage: 10,
      energy: 40,
      events: "landed incoming melee/ranged",
      resourceSelection: "current power bar",
      serverVerified: false,
    },
    foreverRewardRelations: 7,
    historicalRewardRelations: 1,
    currentServerAcquisitionVerified: false,
    publicationAllowed: false,
  };
}

/** Append current base-set stats; historical rows supply icons rather than stats.
 * @param {object} parent @param {object} evidence @returns {object}
 */
export function extendDruidFeralheartCatalog(parent, evidence) {
  const rules = extractDruidFeralheartRules(evidence),
    db = JSON.parse(JSON.stringify(parent)),
    additions = [],
    sources = [],
    ratings = currentLevel60Ratings(evidence.ratings),
    sets = new Map(evidence.normalized.sets.map((row) => [row.id, row]));
  assert.equal(new Set(parent.items.map((row) => row.id)).size, parent.items.length);
  for (const id of druidFeralheartItemIds) {
    assert(!parent.items.some((row) => row.id === id), "Refusing to replace Feralheart item " + id);
    const current = one(
        evidence.normalized.items,
        (row) => row.itemId === id,
        "current Feralheart " + id,
      ),
      sparse = one(evidence.tables.ItemSparse, (row) => row.id === id, "sparse Feralheart " + id),
      historical = one(evidence.historical, (row) => row.id === id, "icon Feralheart " + id);
    assert.deepEqual(
      [current.setId, current.classId, current.subclassId, sparse.Bonding],
      [513, 4, 2, 1],
    );
    assert.deepEqual(current.effectIds, []);
    const item = normalizeCurrentPrebisItem(current, sparse, historical, ratings, sets);
    item.classAllowlist = [1]; // Pickup class-quest acquisition, independently of unrestricted sparse wear flags.
    db.items.push(item);
    additions.push(item);
    const quests = evidence.acquisition.relations
      .filter((row) => row.rewardIds.includes(id))
      .map((row) => ({
        id: row.questId,
        faction: row.faction,
        url: row.url,
        relationBasis: row.rewardRelationBasis,
        foreverPageReviewed: row.currentForeverRewardPageReviewed,
      }));
    sources.push({
      id,
      name: current.name,
      requiredLevel: current.requiredLevel,
      sources: [{ kind: "dungeon-quest", quests }],
      acquisition: {
        kind: "dungeon-set-upgrade",
        obtainableClass: 1,
        binding: "pickup",
        currentServerVerified: false,
      },
      status: "current-client-reviewed-quest-acquisition-provisional",
      notes: [
        "Base set 513 only; alternate 1667 is a separate identity.",
        ...(id === 22108
          ? [
              "Horde quest 8913 uses a historical reward relation; its Forever page was unavailable.",
            ]
          : []),
      ],
    });
  }
  assert.deepEqual(db.items.slice(0, parent.items.length), parent.items);
  return { db, additions, sources, rules, numericalReuseAllowed: false, publicationAllowed: false };
}

/** Bind base ID 513 separately from identically named alternate effects.
 * @param {{itemSets:string,foreverSets:string}} source @returns {{itemSets:string,foreverSets:string}}
 */
export function applyDruidFeralheartDispatch(source) {
  const once = (text, before, after) => {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  };
  assert(!source.itemSets.includes("kfcFeralheartBonuses"));
  let foreverSets = once(
    source.foreverSets,
    "func ForeverEquipmentBonusSupported(id, pieces int32) bool {",
    "func ForeverEquipmentBonusSupported(id, pieces int32) bool {\n\tif id == 513 {return kfcFeralheartBonusSupported(id,pieces)}",
  );
  foreverSets = once(
    foreverSets,
    "func overridesForeverEquipmentSet(id int32) bool {",
    "func overridesForeverEquipmentSet(id int32) bool {\n\tif id == 513 {return true}",
  );
  foreverSets = once(
    foreverSets,
    "for _, id := range ids {\n\t\tset, exists := foreverEquipmentSets[id]",
    "for _, id := range ids {\n\t\tif id == 513 {continue}\n\t\tset, exists := foreverEquipmentSets[id]",
  );
  return {
    itemSets: once(
      source.itemSets,
      "activeBonuses = append(activeBonuses, character.kfcForeverDungeonManaBonuses()...)",
      "activeBonuses = append(activeBonuses, character.kfcForeverDungeonManaBonuses()...)\n\t\tactiveBonuses=append(activeBonuses,character.kfcFeralheartBonuses()...)",
    ),
    foreverSets,
  };
}
