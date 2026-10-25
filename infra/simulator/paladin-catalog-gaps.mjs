import assert from "node:assert/strict";
import { currentLevel60Ratings } from "./current-prebis-staging.mjs";

const flatChannels = { 3: 1, 4: 0, 47: 16, 48: 30, 55: 38, 85: 7, 87: 8, 88: 11 };
const reviewedIds = [
  872, 1951, 2292, 2816, 6449, 6463, 6481, 7709, 7711, 10762, 16732, 250490, 250495, 250497, 250500,
  250515,
];
const modifierNames = {
  37: "EXPERTISE_RATING",
  46: "HEALTH_REGEN",
  83: "PHYSICAL_DAMAGE_DONE",
  90: "TWOHANDED_AXES_SKILL",
  112: "HERBALISM_SKILL",
  113: "MINING_SKILL",
  126: "ATTACK_POWER_VS_ELEMENTAL",
  128: "ATTACK_POWER_VS_UNDEAD",
  131: "ATTACK_POWER_VS_BEAST",
  136: "SPELL_DAMAGE_VS_UNDEAD",
};
const inactiveReasons = {
  37: "Friendly healing has no melee avoidance roll; the workload has no hostile melee rotation.",
  83: "The workload has no physical damage output; item self-damage is magical.",
  90: "Weapon-skill bonuses are excluded by the campaign rules.",
  112: "Harvesting skill does not change the declared stationary assignment or its fixed profession qualification.",
  113: "Harvesting skill does not change the declared stationary assignment or its fixed profession qualification.",
  126: "Creature-specific attack power has no effect without a hostile attack rotation.",
  128: "Creature-specific attack power has no effect without a hostile attack rotation.",
  131: "Creature-specific attack power has no effect without a hostile attack rotation.",
  136: "The workload has no hostile spell rotation; player self-damage is not damage against an Undead NPC.",
};

/** Classify all captured modifier gaps without dropping their items from the pool.
 * @param {object} source @returns {object}
 */
export function extractPaladinCatalogGapRules(source) {
  assert.equal(source.schema, "kfc-paladin-catalog-gaps-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.equal(source.serverMechanicsVerified, false);
  assert.equal(source.regenTimingVerified, false);
  assert.deepEqual(source.changedIds, reviewedIds);
  assert.deepEqual(source.statTypeNames, modifierNames);
  assert.equal(source.diagnostic.length, 18);
  assert.equal(source.unsupportedModifiers.length, 19);
  const strings = new Map(
    source.tables.GlobalStrings.map((row) => [row.BaseTag, row.TagText_lang]),
  );
  assert.equal(strings.get("ITEM_MOD_HEALTH_REGEN"), "Restores %s health per 5 sec.");
  assert.equal(strings.get("ITEM_MOD_TWOHANDED_AXES"), "Increases two-handed axes skill by %s.");
  assert.equal(strings.get("ITEM_MOD_HERBALISM"), "Increases herbalism skill by %s.");
  assert.equal(strings.get("ITEM_MOD_MINING"), "Increases mining skill by %s.");
  const current = new Map(source.currentItems.map((row) => [row.itemId, row]));
  const healthRegen = [],
    inactive = [];
  for (const row of source.unsupportedModifiers) {
    assert(Number.isFinite(row.value) && row.value > 0);
    assert(source.candidateIds.includes(row.id));
    assert(Object.hasOwn(modifierNames, row.statType), "Unreviewed modifier type");
    const stats = current.get(row.id)?.stats.filter((stat) => stat.statType === row.statType);
    assert.equal(stats?.length, 1);
    assert.equal(stats[0].value, row.value);
    if (row.statType === 46) healthRegen.push({ itemId: row.id, healthPerFive: row.value });
    else
      inactive.push({
        ...row,
        name: modifierNames[row.statType],
        reason: inactiveReasons[row.statType],
        retainedInEquipmentDomain: true,
      });
  }
  healthRegen.sort((a, b) => a.itemId - b.itemId);
  assert.deepEqual(healthRegen, [
    { itemId: 2816, healthPerFive: 12 },
    { itemId: 6320, healthPerFive: 4 },
    { itemId: 6459, healthPerFive: 6 },
    { itemId: 6461, healthPerFive: 10 },
    { itemId: 6910, healthPerFive: 5 },
    { itemId: 7684, healthPerFive: 9 },
    { itemId: 14149, healthPerFive: 5 },
    { itemId: 16731, healthPerFive: 8 },
  ]);
  assert.equal(inactive.length, 11);
  assert.equal(source.newQuestBaseStatsVerified, false);
  assert.deepEqual(
    source.historicalQuestAlternatives.map((row) => row.id),
    [20504, 20505],
  );
  assert.equal(source.historicalQuestEvidence.questId, 8418);
  assert.equal(source.historicalQuestEvidence.currentAcquisitionVerified, false);
  assert.equal(source.tables.ItemSearchName.length, 0);
  assert.equal(source.tables.ItemXItemEffect.length, 0);
  assert(!source.tables.ItemSparse.some((row) => [20504, 20505].includes(row.id)));
  for (const [id, kind, subclass, slot] of [
    [20504, 2, 8, 17],
    [20505, 4, 0, 11],
  ]) {
    const item = source.tables.Item.filter((row) => row.id === id);
    assert.equal(item.length, 1);
    assert.deepEqual(
      [item[0].ClassID, item[0].SubclassID, item[0].InventoryType],
      [kind, subclass, slot],
    );
  }
  return {
    schema: "kfc-paladin-catalog-gap-rules.v1",
    sourceBuild: 70532,
    reviewedStatDifferences: 18,
    changedItems: reviewedIds.slice(),
    healthRegen,
    defaultHealthRegenTickMs: 2000,
    healthRegenTickReferences: [2000, 5000],
    healthRegenIsSpellHealing: false,
    inactiveModifiers: inactive,
    questAlternatives: [20504, 20505, 20512],
    questChoice: "quest:8418",
    absentChannelsAssumedZero: false,
    regenTimingVerified: false,
    newQuestBaseStatsVerified: false,
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}

/** Amend exactly the current disagreements and add the two provisional quest choices.
 * @param {object} parent @param {object[]} parentSources @param {object} source @returns {object}
 */
export function recoverPaladinCatalogGaps(parent, parentSources, source) {
  const rules = extractPaladinCatalogGapRules(source),
    ratings = currentLevel60Ratings(source.ratings);
  const items = new Map(parent.items.map((row) => [row.id, row]));
  const originals = new Map(source.items.map((row) => [row.id, row]));
  const sourceRows = new Map(parentSources.map((row) => [row.id, row]));
  const current = new Map(source.currentItems.map((row) => [row.itemId, row]));
  assert.equal(items.size, parent.items.length);
  assert.equal(sourceRows.size, parentSources.length);
  const db = structuredClone(parent),
    sources = structuredClone(parentSources);
  const updated = new Map(db.items.map((row) => [row.id, row]));
  for (const row of source.diagnostic) {
    const old = items.get(row.id),
      raw = current.get(row.id),
      index = row.statType === 12 ? 28 : flatChannels[row.statType];
    assert(old && raw && index !== undefined);
    assert.deepEqual(old, originals.get(row.id));
    assert.deepEqual(
      sourceRows.get(row.id),
      source.sources.find((entry) => entry.id === row.id),
    );
    assert.equal(old.name, raw.name);
    const values = raw.stats.filter((stat) => stat.statType === row.statType);
    assert.equal(values.length, 1);
    const value = values[0].value / (row.statType === 12 ? ratings["Defense Skill"] : 1);
    assert.equal(old.stats[index], row.engine);
    assert.equal(value, row.current);
    updated.get(row.id).stats[index] = value;
  }
  const changes = reviewedIds.map((id) => ({
    id,
    fields: ["stats"],
    before: items.get(id),
    after: updated.get(id),
  }));
  for (const change of changes) {
    assert.notDeepEqual(change.before, change.after);
    const record = sources.find((row) => row.id === change.id);
    record.statReview = {
      ...record.statReview,
      build: 70532,
      scope: "explicit current item modifiers",
      fields: [...new Set([...(record.statReview?.fields ?? []), "stats"])],
      historicalAcquisitionPreserved: true,
      currentModifierOverrides: source.diagnostic
        .filter((row) => row.id === change.id)
        .map(({ statType, engine, current }) => ({ statType, before: engine, after: current })),
    };
  }
  const orbSource = sourceRows.get(20512);
  assert.equal(orbSource?.questChoice, rules.questChoice);
  for (const row of source.historicalQuestAlternatives) {
    assert(!items.has(row.id) && !sourceRows.has(row.id));
    assert.equal(row.stats.length, 44);
    assert.deepEqual(row.classAllowlist, [4]);
    const item = { ...structuredClone(row), factionRestriction: 1 };
    db.items.push(item);
    sources.push({
      ...structuredClone(orbSource),
      id: row.id,
      name: row.name,
      note: "Provisional Classic Paladin dungeon-quest reward metadata. Current base stats, effects and availability are unverified; shares the one-reward quest choice with Sanctified Orb.",
    });
  }
  for (const old of parent.items)
    if (!reviewedIds.includes(old.id)) assert.deepEqual(updated.get(old.id), old);
  for (const old of parentSources)
    if (!reviewedIds.includes(old.id))
      assert.deepEqual(
        sources.find((row) => row.id === old.id),
        old,
      );
  assert.deepEqual(items.get(272681), originals.get(272681));
  assert.deepEqual([updated.get(272681).stats[41], updated.get(272681).stats[42]], [176, 58]);
  return {
    db,
    sources,
    rules,
    changes,
    addedIds: [20504, 20505],
    numericalReuseAllowed: false,
    publicationAllowed: false,
  };
}

/** Generate only the actor and explicit health-regeneration timing transport.
 * @param {object} source @param {string} implementation @returns {object}
 */
export function renderPaladinCatalogGaps(source, implementation) {
  const rules = extractPaladinCatalogGapRules(source);
  const once = (text, before, after) => {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  };
  let actor = once(
    source.integration.actor,
    "healingUtilities *kfcPaladinHealingUtilities }",
    "healingUtilities *kfcPaladinHealingUtilities; itemHealthRegen *kfcPaladinItemHealthRegen }",
  );
  actor = once(
    actor,
    "holy.registerKFCPaladinHealingUtilities()",
    "holy.registerKFCPaladinHealingUtilities()\n holy.registerKFCPaladinItemHealthRegen()",
  );
  let workload = source.integration.workload;
  for (const name of ["KFCPaladinHealingWorkload", "KFCPaladinHealingWorkloadResult"])
    workload = once(
      workload,
      `type ${name} struct {`,
      `type ${name} struct {\n ItemHealthRegenTickMs *int64 \x60json:"itemHealthRegenTickMs,omitempty"\x60`,
    );
  workload = once(
    workload,
    "\tif err=healer.ConfigureKFCPaladinHealingUtilities",
    "\tif err=healer.ConfigureKFCPaladinItemHealthRegen(sim,frame.ItemHealthRegenTickMs);err!=nil{return nil,err}\n\tif err=healer.ConfigureKFCPaladinHealingUtilities",
  );
  workload = once(
    workload,
    "output = &KFCPaladinHealingWorkloadResult{",
    "output = &KFCPaladinHealingWorkloadResult{ItemHealthRegenTickMs:healer.itemHealthRegen.echo, ",
  );
  implementation = once(
    implementation,
    "// KFC_PALADIN_HEALTH_REGEN_VALUES",
    `var kfcPaladinHealthPerFive = map[int32]float64{${rules.healthRegen.map((row) => `${row.itemId}:${row.healthPerFive}`).join(",")}}`,
  );
  return { rules, actor, workload, implementation };
}
