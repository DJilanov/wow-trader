import assert from "node:assert/strict";

/** Resolve the captured Orb payload while preserving unavailable current base metadata.
 * @param {object} source @returns {object}
 */
export function extractPaladinSanctifiedOrb(source) {
  assert.equal(source.schema, "kfc-paladin-sanctified-orb-source.v3");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.equal(source.currentBaseStatsVerified, false);
  assert.equal(source.serverMechanicsVerified, false);
  const one = (table) => {
    assert.equal(source.tables[table].length, 1, table);
    return source.tables[table][0];
  };
  const item = one("Item"),
    link = one("ItemXItemEffect"),
    use = one("ItemEffect"),
    effect = one("SpellEffect"),
    cooldown = one("SpellCooldowns"),
    category = one("SpellCategories"),
    misc = one("SpellMisc"),
    cast = one("SpellCastTimes");
  assert.deepEqual([item.id, item.ClassID, item.InventoryType], [20512, 4, 12]);
  assert.equal(source.tables.ItemSparse.length, 0);
  assert.equal(source.tables.ItemSearchName.length, 0);
  assert.deepEqual([link.ItemID, link.ItemEffectID, use.id], [20512, 102759, 102759]);
  assert.deepEqual(
    [
      use.SpellID,
      use.TriggerType,
      use.CoolDownMSec,
      use.CategoryCoolDownMSec,
      use.SpellCategoryID,
      use.Charges,
      use.ChrSpecializationID,
      use.PlayerConditionID,
    ],
    [24865, 0, 300000, -1, 0, 0, 0, 0],
  );
  assert.deepEqual(
    [
      effect.SpellID,
      effect.Effect,
      effect.EffectAura,
      effect.EffectBasePointsF,
      effect.Variance,
      effect.EffectMiscValue,
      effect.ImplicitTarget,
    ],
    [24865, 30, 0, 340, 0.125, [0, 0], [1, 0]],
  );
  for (const key of [
    "EffectBonusCoefficient",
    "EffectTriggerSpell",
    "EffectRealPointsPerLevel",
    "EffectAuraPeriod",
    "Coefficient",
    "ResourceCoefficient",
    "BonusCoefficientFromAP",
  ])
    assert.equal(effect[key], 0, key);
  assert.deepEqual(
    [
      cooldown.SpellID,
      cooldown.RecoveryTime,
      cooldown.CategoryRecoveryTime,
      cooldown.StartRecoveryTime,
      category.SpellID,
      category.Category,
    ],
    [24865, 0, 60000, 0, 24865, 30],
  );
  assert.equal(misc.DurationIndex, 0);
  assert.equal(misc.CastingTimeIndex, cast.id);
  assert.deepEqual(cast, { id: 1, Base: 0, Minimum: 0 });
  assert(one("Spell").Description_lang.includes("doubled in Wasteland and Haunted areas"));
  assert.equal(source.cooldownInterpretation.id, "item-effect-override-reference");
  assert.equal(source.cooldownInterpretation.blizzardServerVerified, false);
  assert.equal(source.cooldownInterpretation.reference.blizzardServerVerified, false);
  const peers = source.sharedCategoryEvidence;
  for (const id of [12662, 4381, 18637, 5509, 5510, 9421]) {
    const links = peers.consumableLinks.filter((row) => row.ItemID === id);
    assert.equal(links.length, 1);
    const effects = peers.consumableItemEffects.filter((row) => row.id === links[0].ItemEffectID);
    assert.equal(effects.length, 1);
    assert.deepEqual([effects[0].SpellCategoryID, effects[0].CategoryCoolDownMSec], [1153, 120000]);
  }
  const historical = source.historicalMetadata;
  assert.deepEqual(
    [historical.id, historical.name, historical.type, historical.classAllowlist],
    [20512, "Sanctified Orb", 12, [4]],
  );
  assert.equal(historical.stats.length, 44);
  assert(historical.stats.every((value) => value === 0));
  assert.equal(source.historicalQuestEvidence.questId, 8418);
  assert.equal(source.historicalQuestEvidence.currentAcquisitionVerified, false);
  assert.deepEqual(
    source.historicalQuestAlternatives.map((row) => row.id).sort((a, b) => a - b),
    [20504, 20505],
  );
  return {
    schema: "kfc-paladin-sanctified-orb-rules.v1",
    sourceBuild: 70532,
    itemId: 20512,
    spellId: 24865,
    mana: { mean: 340, minimum: 318.75, maximum: 361.25 },
    areaMultipliers: { neutral: 1, wasteland: 2, haunted: 2 },
    defaultArea: "neutral",
    cooldownMs: 300000,
    sharedCategory: 0,
    sharedCooldownMs: 0,
    globalCooldownMs: 0,
    spellCategoryDefaults: { category: 30, recoveryMs: 60000 },
    resolution: "item-effect-override-reference",
    consumesCategory: 1153,
    independentOfConjuredAndOffensiveTrinkets: true,
    explicitOwnedUse: true,
    historicalMetadata: structuredClone(historical),
    historicalQuestId: 8418,
    currentBaseStatsVerified: false,
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}

/** Add only the missing provisional quest item and preserve shared reward ownership.
 * @param {object} db @param {object[]} sources @param {object} evidence @returns {object}
 */
export function extendPaladinOrbCatalog(db, sources, evidence) {
  const rules = extractPaladinSanctifiedOrb(evidence);
  assert(!db.items.some((item) => item.id === rules.itemId), "Orb already has a catalog record");
  assert(!sources.some((source) => source.id === rules.itemId));
  const next = structuredClone(db),
    sourceRows = structuredClone(sources),
    item = { ...rules.historicalMetadata, factionRestriction: 1 },
    choice = "quest:8418";
  next.items.push(item);
  sourceRows.push({
    id: item.id,
    name: item.name,
    requiredLevel: 60,
    limitCategory: 0,
    status: "classic-provisional",
    questChoice: choice,
    sources: [{ kind: "dungeon-quest", questId: 8418, zoneId: 1477, faction: "Alliance" }],
    acquisition: {
      allowed: true,
      kind: "dungeon-quest",
      evidence: evidence.historicalQuestEvidence.url,
    },
    note: "Historical level-60 comparison metadata and Paladin dungeon-quest acquisition; current base stats and availability unverified. The mana use is captured from the current client; the old crit effect is replaced.",
  });
  for (const source of sourceRows)
    if ([20504, 20505].includes(source.id)) source.questChoice = choice;
  return { db: next, sources: sourceRows, rules, addedIds: [20512] };
}

/** Derive the owned mana use without editing a frozen runtime.
 * @param {object} source @param {string} implementation @returns {object}
 */
export function renderPaladinSanctifiedOrb(source, implementation) {
  const rules = extractPaladinSanctifiedOrb(source);
  const once = (text, before, after) => {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  };
  const old =
    "core.NewSimpleStatOffensiveTrinketEffect(SanctifiedOrb, stats.Stats{stats.MeleeCrit: 3 * core.CritRatingPerCritChance, stats.SpellCrit: 3 * core.CritRatingPerCritChance}, time.Second*25, time.Minute*3)";
  let items = once(
    source.integration.items,
    old,
    "core.NewItemEffect(SanctifiedOrb, registerKFCSanctifiedOrb)",
  );
  if (!items.includes("stats."))
    items = once(items, '\n\t"github.com/wowsims/classic/sim/core/stats"', "");
  // time is used only by the replaced historical effect in this captured parent.
  if (!items.includes("time.")) items = once(items, '\n\t"time"', "");
  const paladin = once(
    source.integration.paladin,
    "type Paladin struct {",
    "type Paladin struct {\n kfcSanctifiedOrb *kfcSanctifiedOrbState",
  );
  let workload = once(
    source.integration.workload,
    "type KFCPaladinHealingWorkload struct {",
    'type KFCPaladinHealingWorkload struct {\n OrbArea *string `json:"orbArea,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCPaladinHealingWorkloadResult struct {",
    'type KFCPaladinHealingWorkloadResult struct {\n OrbArea string `json:"orbArea,omitempty"`',
  );
  workload = once(
    workload,
    "\tif frame.ItemEffectsPolicy != nil {",
    "\tif frame.OrbArea != nil { if err = healer.ConfigureKFCSanctifiedOrbArea(*frame.OrbArea); err != nil { return nil,err } }\n\tif frame.ItemEffectsPolicy != nil {",
  );
  workload = once(
    workload,
    "output = &KFCPaladinHealingWorkloadResult{",
    "output = &KFCPaladinHealingWorkloadResult{OrbArea: healer.KFCSanctifiedOrbArea(), ",
  );
  const cooldowns = once(
    source.integration.cooldowns,
    "13444, 272439, 272438:",
    "13444, 272439, 272438, 20512:",
  );
  for (const fragment of [
    "package paladin",
    'sim.RollWithLabel(318.75, 361.25, "Sanctified Orb Mana")',
    "Duration: 5 * time.Minute",
    "core.CooldownTypeMana",
    'state.area == "haunted" || state.area == "wasteland"',
  ])
    assert(implementation.includes(fragment), fragment);
  assert(
    !implementation.includes("GetConjuredCD") && !implementation.includes("GetOffensiveTrinketCD"),
  );
  return { rules, items, paladin, workload, cooldowns, implementation };
}
