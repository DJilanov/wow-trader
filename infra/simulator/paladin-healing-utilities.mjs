import assert from "node:assert/strict";

/** Validate current item payloads without claiming verified server behavior.
 * @param {object} source @returns {object}
 */
export function extractPaladinHealingUtilities(source) {
  assert.equal(source.schema, "kfc-paladin-healing-utility-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.deepEqual(source.itemIds, [4262, 7939, 8346, 11808, 11923]);
  assert.equal(source.serverMechanicsVerified, false);
  assert.equal(source.currentBaseStatsVerified, false);
  const { tables } = source;
  const one = (name, predicate) => {
    const found = tables[name].filter(predicate);
    assert.equal(found.length, 1, name);
    return found[0];
  };
  for (const [itemId, spellId, trigger, cooldown] of [
    [4262, 9163, 0, 300000],
    [7939, 9778, 1, -1],
    [8346, 10577, 0, 1800000],
    [11808, 17447, 0, 300000],
    [11923, 1300890, 1, -1],
  ]) {
    const link = one("ItemXItemEffect", (row) => row.ItemID === itemId);
    const item = one("ItemEffect", (row) => row.id === link.ItemEffectID);
    assert.deepEqual(
      [
        item.SpellID,
        item.TriggerType,
        item.CoolDownMSec,
        item.CategoryCoolDownMSec,
        item.SpellCategoryID,
        item.Charges,
        item.ChrSpecializationID,
        item.PlayerConditionID,
      ],
      [spellId, trigger, cooldown, trigger ? -1 : 0, 0, 0, 0, 0],
    );
  }
  assert.equal(tables.ItemXItemEffect.length, 5);
  assert.equal(tables.ItemEffect.length, 5);
  assert.equal(tables.SpellEffect.length, 8);
  for (const [id, index, effect, aura, mean, variance, period, trigger, targets] of [
    [9163, 0, 10, 0, 300, 0.5, 0, 0, [1, 0]],
    [10577, 0, 10, 0, 400, 0.5, 0, 0, [21, 0]],
    [9778, 0, 6, 42, 1, 0, 0, 9777, [1, 0]],
    [9777, 0, 10, 0, 80, 0.5, 0, 0, [1, 0]],
    [1300890, 0, 6, 42, 100, 0, 0, 1300891, [1, 0]],
    [1300891, 0, 10, 0, 1176, 0.16, 0, 0, [22, 20]],
    [17447, 0, 6, 24, 79, 0.5, 1000, 0, [1, 0]],
    [17447, 1, 6, 3, 79, 0.5, 1000, 0, [1, 0]],
  ]) {
    const row = one("SpellEffect", (r) => r.SpellID === id && r.EffectIndex === index);
    assert.deepEqual(
      [
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.Variance,
        row.EffectAuraPeriod,
        row.EffectTriggerSpell,
        row.ImplicitTarget,
      ],
      [effect, aura, mean, variance, period, trigger, targets],
    );
    for (const field of [
      "EffectBonusCoefficient",
      "EffectRealPointsPerLevel",
      "Coefficient",
      "ResourceCoefficient",
      "BonusCoefficientFromAP",
    ])
      assert.equal(row[field], 0);
  }
  for (const id of [9163, 10577]) {
    const gcd = one("SpellCooldowns", (row) => row.SpellID === id);
    assert.deepEqual(
      [gcd.StartRecoveryTime, gcd.RecoveryTime, gcd.CategoryRecoveryTime],
      [1500, 0, 0],
    );
  }
  assert.equal(tables.SpellCooldowns.length, 2);
  for (const [id, chance, mask] of [
    [9778, 3, 40],
    [1300890, 100, 16777216],
  ]) {
    const proc = one("SpellAuraOptions", (row) => row.SpellID === id);
    assert.deepEqual(
      [
        proc.ProcChance,
        proc.ProcTypeMask,
        proc.ProcCategoryRecovery,
        proc.ProcCharges,
        proc.SpellProcsPerMinuteID,
      ],
      [chance, [mask, 0], 0, 0, 0],
    );
  }
  for (const id of [9163, 10577, 9777, 1300891, 17447]) {
    const misc = one("SpellMisc", (row) => row.SpellID === id);
    assert.equal(misc.SchoolMask, id === 17447 ? 4 : 2);
    assert.equal(misc.CastingTimeIndex, 1);
    assert.equal(misc.RangeIndex, [9163, 10577, 1300891].includes(id) ? 5 : 1);
    if (id === 1300891 || id === 17447) assert.equal(misc.Attributes[2] & 0x20000000, 0x20000000);
    else assert.equal(misc.Attributes[2] & 0x20000000, 0);
  }
  const channel = one("SpellMisc", (row) => row.SpellID === 17447);
  assert.equal(channel.Attributes[1] & 0x40, 0x40);
  assert.deepEqual(channel.Attributes.slice(3, 7), [0, 0, 0, 0]);
  const duration = one("SpellDuration", (row) => row.id === channel.DurationIndex);
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [10000, 10000, 0],
  );
  assert.deepEqual(one("SpellEffect", (r) => r.SpellID === 1300891).EffectRadiusIndex, [0, 23]);
  const radius = one("SpellRadius", (row) => row.id === 23);
  assert.deepEqual([radius.Radius, radius.RadiusMax, radius.RadiusPerLevel], [40, 40, 0]);
  const range = one("SpellRange", (row) => row.id === 5);
  assert.deepEqual(range.RangeMax, [40, 40]);
  const cast = one("SpellCastTimes", (row) => row.id === 1);
  assert.equal(cast.Base, 0);
  assert.equal(tables.SpellPower.length, 0);
  for (const row of tables.ItemSparse) assert.equal(row.RequiredSkill, 0);
  assert(
    one("Spell", (row) => row.id === 1300890).Description_lang.includes(
      "Dying heals all party members",
    ),
  );
  return {
    schema: "kfc-paladin-healing-utility-rules.v1",
    sourceBuild: 70532,
    belt: { itemId: 4262, healing: [225, 375], selfOnly: true, cooldownMs: 300000, gcdMs: 1500 },
    gauntlets: { itemId: 8346, healing: [300, 500], range: 40, cooldownMs: 1800000, gcdMs: 1500 },
    truesilver: {
      itemId: 7939,
      healing: [60, 100],
      chance: 0.03,
      trigger: "taken-landed-melee",
      internalCooldownMs: 0,
    },
    grace: {
      itemId: 11923,
      healing: [1081.92, 1270.08],
      radius: 40,
      partyOnly: true,
      trigger: "owner-death",
      canCrit: false,
    },
    circle: {
      itemId: 11808,
      manaPerTick: [59.25, 98.75],
      damagePerTick: [59.25, 98.75],
      school: "fire",
      ticks: 10,
      periodMs: 1000,
      cooldownMs: 300000,
      canCrit: false,
      rollCorrelation: "independent-reference",
      channelHaste: "scaled-reference-with-unscaled-sensitivity",
    },
    directItemCrit: "noncritical-reference-with-critical-sensitivity",
    itemGcd: "existing-Forever-nonphysical-haste-reference",
    currentBaseStatsVerified: false,
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}

/** Add owned utility hooks to a derived model; preserve frozen parent files.
 * @param {object} source @param {string} implementation @param {string} recombobulators @returns {object}
 */
export function renderPaladinHealingUtilities(source, implementation, recombobulators) {
  const rules = extractPaladinHealingUtilities(source);
  const once = (text, before, after) => {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  };
  let actor = once(
    source.integration.actor,
    "regenerationItems *kfcPaladinRegenerationItems }",
    "regenerationItems *kfcPaladinRegenerationItems; healingUtilities *kfcPaladinHealingUtilities }",
  );
  actor = once(
    actor,
    "holy.registerKFCPaladinRegenerationItems()",
    "holy.registerKFCPaladinRegenerationItems()\n holy.registerKFCPaladinHealingUtilities()",
  );
  let workload = source.integration.workload;
  for (const type of ["KFCPaladinHealingWorkload", "KFCPaladinHealingWorkloadResult"])
    workload = once(
      workload,
      `type ${type} struct {`,
      `type ${type} struct {\n UtilityHealingCanCrit *bool \x60json:"utilityHealingCanCrit,omitempty"\x60\n CircleChannelScales *bool \x60json:"circleChannelScales,omitempty"\x60`,
    );
  workload = once(
    workload,
    "\tif err=healer.configureKFCPaladinWorkloadItemArea",
    "\tif err=healer.ConfigureKFCPaladinHealingUtilities(sim,frame.UtilityHealingCanCrit,frame.CircleChannelScales);err!=nil{return nil,err}\n\tif err=healer.configureKFCPaladinWorkloadItemArea",
  );
  workload = once(
    workload,
    "output = &KFCPaladinHealingWorkloadResult{",
    "output = &KFCPaladinHealingWorkloadResult{UtilityHealingCanCrit:healer.healingUtilities.criticalEcho, CircleChannelScales:healer.healingUtilities.channelEcho, ",
  );
  workload = once(
    workload,
    "if healer.CurrentHealth() <= 0 || !healer.GCD.IsReady(sim) {",
    "if healer.CurrentHealth() <= 0 || healer.IsCasting(sim) || healer.IsChanneling(sim) || !healer.GCD.IsReady(sim) {",
  );
  let cooldowns = once(
    source.integration.cooldowns,
    "272438, 20512, 18637:",
    "272438, 20512, 18637, 4262, 8346, 11808:",
  );
  cooldowns = once(
    cooldowns,
    "\t\tif policy.ItemID==4381",
    "\t\tif policy.ItemID==4262 || policy.ItemID==8346 {healer.tryKFCPaladinUtilityHeal(sim,frame,policy);continue}\n\t\tif policy.ItemID==4381",
  );
  cooldowns = once(
    cooldowns,
    "\t\tif err:=healer.validateKFCPaladinRecombobulatorCooldown(policy);err!=nil{return err}",
    '\t\tif err:=healer.validateKFCPaladinRecombobulatorCooldown(policy);err!=nil{return err}\n if policy.ItemID==4262 && policy.TargetRaidIndex!=nil && *policy.TargetRaidIndex!=healer.Index && *policy.TargetRaidIndex!=-1{return fmt.Errorf("belt recipient must be self")}',
  );
  const requestRules = once(
    source.integration.requestRules,
    "\t\t\t\tunit.InterruptCast(sim)\n",
    "\t\t\t\tunit.InterruptCast(sim)\n if unit==&healer.Unit {healer.triggerKFCGraceDeathHeal(sim)}\n",
  );
  const recipients = once(
    recombobulators,
    "recombobulator := policy.ItemID == 4381 || policy.ItemID == 18637",
    "recombobulator := policy.ItemID == 4381 || policy.ItemID == 18637 || policy.ItemID == 4262 || policy.ItemID == 8346",
  );
  assert(implementation.includes("sim.Proc(0.03,"));
  assert(implementation.includes("dot.Spell.OutcomeAlwaysHitNoHitCounter"));
  assert(implementation.includes("state.grace.OutcomeHealing"));
  return {
    rules,
    actor,
    workload,
    cooldowns,
    requestRules,
    recombobulators: recipients,
    implementation,
  };
}
