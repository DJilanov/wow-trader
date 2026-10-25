import assert from "node:assert/strict";

/** Extract owned regeneration effects without changing provisional base statistics.
 * @param {object} source @returns {object}
 */
export function extractPaladinRegenerationItems(source) {
  assert.equal(source.schema, "kfc-paladin-regeneration-item-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.equal(source.serverMechanicsVerified, false);
  assert.deepEqual(source.itemIds, [6323, 13143, 13505, 18472]);
  const { tables } = source;
  const one = (name, predicate) => {
    const rows = tables[name].filter(predicate);
    assert.equal(rows.length, 1, name);
    return rows[0];
  };
  for (const [id, spellId, trigger] of [
    [6323, 1292142, 1],
    [13143, 17252, 0],
    [13505, 17625, 1],
    [18472, 1318477, 1],
  ]) {
    const link = one("ItemXItemEffect", (r) => r.ItemID === id),
      item = one("ItemEffect", (r) => r.id === link.ItemEffectID);
    assert.deepEqual(
      [
        item.SpellID,
        item.TriggerType,
        item.Charges,
        item.ChrSpecializationID,
        item.PlayerConditionID,
      ],
      [spellId, trigger, 0, 0, 0],
    );
    assert.deepEqual(
      [item.CoolDownMSec, item.CategoryCoolDownMSec, item.SpellCategoryID],
      trigger === 0 ? [1800000, 0, 0] : [-1, -1, 0],
    );
  }
  assert.equal(tables.ItemXItemEffect.length, 4);
  assert.equal(tables.ItemEffect.length, 4);
  assert.equal(tables.SpellEffect.length, 6);
  const rows = [];
  for (const [spellId, index, effect, aura, amount, period, target] of [
    [1292142, 0, 35, 161, 4, 0, 1],
    [17252, 0, 6, 69, 500, 0, 1],
    [17252, 1, 6, 24, 22, 5000, 1],
    [17625, 0, 6, 8, 60, 5000, 1],
    [17625, 1, 6, 31, 8, 0, 1],
    [1318477, 0, 6, 85, 9, 0, 1],
  ]) {
    const row = one("SpellEffect", (r) => r.SpellID === spellId && r.EffectIndex === index);
    assert.deepEqual(
      [row.Effect, row.EffectAura, row.EffectBasePointsF, row.EffectAuraPeriod, row.ImplicitTarget],
      [effect, aura, amount, period, [target, 0]],
    );
    for (const field of [
      "EffectBonusCoefficient",
      "EffectRealPointsPerLevel",
      "Coefficient",
      "ResourceCoefficient",
      "Variance",
      "BonusCoefficientFromAP",
      "EffectTriggerSpell",
    ])
      assert.equal(row[field], 0);
    rows.push(row);
  }
  assert.deepEqual(rows[0].EffectRadiusIndex, [10, 10]);
  const radius = one("SpellRadius", (r) => r.id === 10);
  assert.deepEqual([radius.Radius, radius.RadiusMax, radius.RadiusPerLevel], [30, 30, 0]);
  assert.deepEqual(rows[1].EffectMiscValue, [127, 0]);
  const misc = one("SpellMisc", (r) => r.SpellID === 17252),
    duration = one("SpellDuration", (r) => r.id === misc.DurationIndex);
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [1800000, 1800000, 0],
  );
  for (const [spellId, text] of [
    [1292142, "party members"],
    [1292142, "every 5 sec"],
    [17252, "While the shield holds"],
    [17625, "restores"],
    [1318477, "Haunted areas"],
  ])
    assert(one("Spell", (r) => r.id === spellId).Description_lang.includes(text));
  for (const name of ["SpellPower", "SpellCooldowns", "SpellAuraOptions"])
    assert.equal(tables[name].length, 0);
  assert(source.integration.commonItems.includes("character.GainHealth(sim, 20, healthMetrics)"));
  return {
    schema: "kfc-paladin-regeneration-item-rules.v1",
    sourceBuild: 70532,
    baron: {
      itemId: 6323,
      health: 4,
      periodMs: 5000,
      radius: 30,
      scope: "party-members",
      regenerationNotHealing: true,
    },
    mark: {
      itemId: 13143,
      spellId: 17252,
      shield: 500,
      mana: 22,
      periodMs: 5000,
      durationMs: 1800000,
      cooldownMs: 1800000,
      sharedCategory: 0,
      manaRequiresShield: true,
    },
    runeblade: {
      itemId: 13505,
      health: 60,
      periodMs: 5000,
      selfOnly: true,
      movementOutsideStationaryStudy: true,
    },
    royalSeal: { itemId: 18472, mp5: 9, area: "haunted" },
    areaReferences: ["neutral", "haunted", "wasteland"],
    currentBaseStatsVerified: false,
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}

/** Integrate only the reviewed Holy actor, workload and owned cooldown.
 * @param {object} source @param {string} implementation @returns {object}
 */
export function renderPaladinRegenerationItems(source, implementation) {
  const rules = extractPaladinRegenerationItems(source),
    once = (text, before, after) => {
      assert.equal(text.split(before).length, 2, before);
      return text.replace(before, after);
    };
  let actor = once(
    source.integration.actor,
    "recombobulators *kfcPaladinRecombobulators }",
    "recombobulators *kfcPaladinRecombobulators; regenerationItems *kfcPaladinRegenerationItems }",
  );
  actor = once(
    actor,
    "holy.registerKFCPaladinRecombobulators()",
    "holy.registerKFCPaladinRecombobulators()\n holy.registerKFCPaladinRegenerationItems()",
  );
  let workload = once(
    source.integration.workload,
    "type KFCPaladinHealingWorkload struct {",
    'type KFCPaladinHealingWorkload struct {\n ItemArea *string `json:"itemArea,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCPaladinHealingWorkloadResult struct {",
    'type KFCPaladinHealingWorkloadResult struct {\n ItemArea string `json:"itemArea,omitempty"`',
  );
  workload = once(
    workload,
    "\tif frame.OrbArea != nil {",
    "\tif err=healer.configureKFCPaladinWorkloadItemArea(sim,frame);err!=nil{return nil,err}\n\tif frame.OrbArea != nil {",
  );
  workload = once(
    workload,
    "output = &KFCPaladinHealingWorkloadResult{",
    "output = &KFCPaladinHealingWorkloadResult{ItemArea:healer.kfcPaladinItemAreaEcho(), ",
  );
  const cooldowns = once(
    source.integration.cooldowns,
    "policy.SpellID == 1302205",
    "policy.SpellID == 1302205 || policy.SpellID == 17252",
  );
  for (const text of [
    "package holy",
    "healer.GainHealth(sim, 60, metrics)",
    "stats.MP5: 9",
    "unit.GainHealth(sim, 4, baronMetrics[unit.UnitIndex])",
    "spell.SelfShield().Apply(sim, 500)",
    "healer.AddMana(sim, 22, mana)",
    'state.area == "haunted"',
  ])
    assert(implementation.includes(text), text);
  return { rules, implementation, actor, workload, cooldowns };
}
