import assert from "node:assert/strict";

/** Validate both current item payloads without substituting the historical mana-only consumable.
 * @param {object} source @returns {object}
 */
export function extractPaladinRecombobulators(source) {
  assert.equal(source.schema, "kfc-paladin-recombobulator-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.equal(source.criticalBehaviorVerified, false);
  assert.equal(source.serverMechanicsVerified, false);
  const one = (name, predicate) => {
    const rows = source.tables[name].filter(predicate);
    assert.equal(rows.length, 1, name);
    return rows[0];
  };
  const rows = [];
  for (const [id, spellId, skill, heal, mana] of [
    [4381, 18805, 140, 270, 128],
    [18637, 23064, 275, 666, 304],
  ]) {
    const item = one("ItemSparse", (row) => row.id === id),
      link = one("ItemXItemEffect", (row) => row.ItemID === id),
      use = one("ItemEffect", (row) => row.id === link.ItemEffectID),
      effects = source.tables.SpellEffect.filter((row) => row.SpellID === spellId).sort(
        (a, b) => a.EffectIndex - b.EffectIndex,
      );
    assert.deepEqual(
      [item.InventoryType, item.RequiredSkill, item.RequiredSkillRank, item.RequiredAbility],
      [12, 202, skill, 0],
    );
    assert.deepEqual(
      [
        use.SpellID,
        use.TriggerType,
        use.Charges,
        use.CoolDownMSec,
        use.CategoryCoolDownMSec,
        use.SpellCategoryID,
        use.ChrSpecializationID,
        use.PlayerConditionID,
      ],
      [spellId, 0, -10, 300000, 120000, 1153, 0, 0],
    );
    assert.equal(effects.length, 3);
    assert.deepEqual(
      effects.map((row) => row.Effect),
      [108, 10, 30],
    );
    assert.deepEqual(effects[0].EffectMiscValue, [17, 0]);
    for (const row of effects) {
      assert.deepEqual(row.ImplicitTarget, [21, 0]);
      for (const field of [
        "EffectAura",
        "EffectBonusCoefficient",
        "EffectRealPointsPerLevel",
        "EffectTriggerSpell",
        "Coefficient",
        "ResourceCoefficient",
        "EffectAuraPeriod",
      ])
        assert.equal(row[field], 0);
    }
    assert.deepEqual(
      effects.slice(1).map((row) => [row.EffectBasePointsF, row.Variance]),
      [
        [heal, 0.5],
        [mana, 0.5],
      ],
    );
    const misc = one("SpellMisc", (row) => row.SpellID === spellId);
    assert.deepEqual(
      [misc.RangeIndex, misc.CastingTimeIndex, misc.DurationIndex, misc.SchoolMask],
      [4, 1, 0, 64],
    );
    rows.push({
      itemId: id,
      spellId,
      engineeringSkill: skill,
      healing: { mean: heal, minimum: heal * 0.75, maximum: heal * 1.25 },
      mana: { mean: mana, minimum: mana * 0.75, maximum: mana * 1.25 },
      charges: 10,
      cooldownMs: 300000,
      sharedCooldownMs: 120000,
      sharedCategory: 1153,
      range: 30,
    });
  }
  assert.equal(source.tables.ItemSparse.length, 2);
  assert.equal(source.tables.ItemXItemEffect.length, 2);
  assert.equal(source.tables.ItemEffect.length, 2);
  assert.equal(source.tables.SpellEffect.length, 6);
  assert.equal(source.tables.SpellPower.length, 0);
  assert.equal(source.tables.SpellCooldowns.length, 0);
  assert.deepEqual(source.tables.SpellCastTimes, [{ id: 1, Base: 0, Minimum: 0 }]);
  const range = one("SpellRange", (row) => row.id === 4);
  assert.deepEqual(
    [range.RangeMin, range.RangeMax],
    [
      [0, 0],
      [30, 30],
    ],
  );
  return {
    schema: "kfc-paladin-recombobulators-rules.v1",
    sourceBuild: 70532,
    items: rows,
    target: "same-friendly-for-health-and-mana",
    criticalReference: false,
    criticalSensitivitySupported: true,
    healthAndManaRolls: "independent-reference",
    assumedEngineeringSkill: 300,
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}

/** Add the class-owned controller and retire only this controller's generic consumable path.
 * @param {object} source @param {string} implementation @returns {object}
 */
export function renderPaladinRecombobulators(source, implementation) {
  const rules = extractPaladinRecombobulators(source),
    once = (text, before, after) => {
      assert.equal(text.split(before).length, 2, before);
      return text.replace(before, after);
    };
  let actor = once(
    source.integration.actor,
    "itemEffects *kfcPaladinItemEffects }",
    "itemEffects *kfcPaladinItemEffects; recombobulators *kfcPaladinRecombobulators }",
  );
  actor = once(
    actor,
    "holy.registerKFCPaladinItemResources()",
    "holy.registerKFCPaladinItemResources()\n holy.registerKFCPaladinRecombobulators()",
  );
  const consumes = once(
    source.integration.consumes,
    "case proto.Conjured_ConjuredMinorRecombobulator:\n\t\tmcd = makeManaConsumableMCD",
    "case proto.Conjured_ConjuredMinorRecombobulator:\n if owner,ok:=agent.(interface{ UsesKFCOwnedRecombobulators() bool });ok && character.Env.IsForever() && owner.UsesKFCOwnedRecombobulators() { return }\n\t\tmcd = makeManaConsumableMCD",
  );
  let workload = once(
    source.integration.workload,
    "type KFCPaladinHealingWorkload struct {",
    'type KFCPaladinHealingWorkload struct {\n RecombobulatorCanCrit *bool `json:"recombobulatorCanCrit,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCPaladinHealingWorkloadResult struct {",
    'type KFCPaladinHealingWorkloadResult struct {\n RecombobulatorCanCrit *bool `json:"recombobulatorCanCrit,omitempty"`',
  );
  workload = once(
    workload,
    "\tif frame.OrbArea != nil {",
    "\tif frame.RecombobulatorCanCrit != nil { if err = healer.ConfigureKFCPaladinRecombobulatorCriticals(*frame.RecombobulatorCanCrit); err != nil { return nil,err } }\n\tif frame.OrbArea != nil {",
  );
  workload = once(
    workload,
    "output = &KFCPaladinHealingWorkloadResult{",
    "output = &KFCPaladinHealingWorkloadResult{RecombobulatorCanCrit: healer.kfcPaladinRecombobulatorCriticalEcho(), ",
  );
  let cooldowns = once(
    source.integration.cooldowns,
    "type KFCPaladinHealingCooldown struct {",
    'type KFCPaladinHealingCooldown struct {\n TargetRaidIndex *int32 `json:"targetRaidIndex,omitempty"`\n MinimumMissingHealth *float64 `json:"minimumMissingHealth,omitempty"`',
  );
  cooldowns = once(
    cooldowns,
    "\t\tif policy.SpellID == 20554",
    "\t\tif err:=healer.validateKFCPaladinRecombobulatorCooldown(policy);err!=nil{return err}\n\t\tif policy.SpellID == 20554",
  );
  cooldowns = once(cooldowns, "272438, 20512:", "272438, 20512, 18637:");
  cooldowns = once(
    cooldowns,
    "\t\tif healer.MaxMana()-healer.CurrentMana() < policy.MinimumMissingMana",
    "\t\tif policy.ItemID==4381 || policy.ItemID==18637 {healer.tryKFCPaladinRecombobulator(sim,frame,policy);continue}\n\t\tif healer.MaxMana()-healer.CurrentMana() < policy.MinimumMissingMana",
  );
  const requestRules = once(
    source.integration.requestRules,
    "func validateKFCPaladinWorkloadRequest(player *proto.Player) error {",
    "func validateKFCPaladinWorkloadRequest(player *proto.Player) error {\n if err:=validateKFCPaladinRecombobulatorSelection(player);err!=nil{return err}",
  );
  let orbTests = once(
    source.integration.orbTests,
    "sim, healer := kfcPaladinOrbFixture(t, true, conjured, 272439)",
    "other:=int32(272439);if conjured==proto.Conjured_ConjuredMinorRecombobulator{other=4381}\n sim,healer:=kfcPaladinRecombFixture(t,[]int32{20512,other},true,conjured)",
  );
  orbTests = once(
    orbTests,
    "if !healer.GetSpell(core.ActionID{ItemID: 272439}).CanCast(sim, &healer.Unit) {",
    "if other==272439 && !healer.GetSpell(core.ActionID{ItemID: 272439}).CanCast(sim, &healer.Unit) {",
  );
  for (const fragment of [
    "package holy",
    "{4381, 202.5, 337.5, 96, 160}",
    "{18637, 499.5, 832.5, 228, 380}",
    "healer.GetConjuredCD()",
    "state.charges[id]--",
    "target.AddMana",
    "target, 30)",
    "HasProfession(proto.Profession_Engineering)",
  ])
    assert(implementation.includes(fragment), fragment);
  return { rules, implementation, actor, consumes, workload, cooldowns, requestRules, orbTests };
}
