import assert from "node:assert/strict";

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

/** Bind Wildheart's exact current thresholds and tooltip-linked resource spells.
 * @param {object} source @returns {object}
 */
export function extractDruidWildheartRules(source) {
  assert.equal(source.schema, "kfc-druid-healing-set-effects-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.equal(source.serverMechanicsVerified, false);
  const tables = source.tables;
  const set = one(tables.ItemSet, (row) => row.id === 185, "Wildheart set");
  assert.deepEqual(
    [set.Name_lang, set.RequiredSkill, set.RequiredSkillRank, set.SetFlags],
    ["Wildheart Raiment", 0, 0, 0],
  );
  assert.deepEqual(
    set.ItemID.filter(Boolean).sort((a, b) => a - b),
    [16706, 16714, 16715, 16716, 16717, 16718, 16719, 16720],
  );
  const links = tables.ItemSetSpell.filter((row) => row.ItemSetID === 185);
  assert.deepEqual(
    links.map((row) => [row.Threshold, row.SpellID]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    [
      [2, 18679],
      [3, 9336],
      [3, 9346],
      [4, 1302708],
      [5, 450608],
      [6, 18378],
    ],
  );
  for (const row of links) assert.deepEqual([row.ChrSpecID, row.TraitSubTreeID], [0, 0]);
  const proc = one(
    tables.SpellAuraOptions,
    (row) => row.SpellID === 450608,
    "Wildheart dummy proc",
  );
  assert.deepEqual(
    [
      proc.ProcChance,
      proc.ProcCategoryRecovery,
      proc.ProcCharges,
      proc.SpellProcsPerMinuteID,
      proc.ProcTypeMask,
    ],
    [100, 0, 0, 0, [81964, 0]],
  );
  for (const [id, effect, aura, amount, resource, period, coefficient] of [
    [450608, 6, 4, 5, 0, 0, 1],
    [27782, 30, 0, 200, 0, 0, 1],
    [27783, 30, 0, 100, 1, 0, 1],
    [27784, 6, 24, 4, 0, 1000, 1],
  ]) {
    const row = one(tables.SpellEffect, (row) => row.SpellID === id, "resource effect " + id);
    assert.deepEqual(
      [
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectMiscValue,
        row.EffectAuraPeriod,
        row.EffectBonusCoefficient,
      ],
      [effect, aura, amount, [resource, 0], period, coefficient],
    );
    assert.deepEqual(row.ImplicitTarget, [1, 0]);
    assert.deepEqual(row.EffectSpellClassMask, [0, 0, 0, 0]);
    for (const field of [
      "EffectTriggerSpell",
      "EffectRealPointsPerLevel",
      "ScalingClass",
      "Variance",
      "Coefficient",
      "BonusCoefficientFromAP",
      "ResourceCoefficient",
    ])
      assert.equal(row[field], 0);
  }
  const durationId = one(
    tables.SpellMisc,
    (row) => row.SpellID === 27784,
    "energy duration",
  ).DurationIndex;
  assert.equal(
    one(tables.SpellDuration, (row) => row.id === durationId, "energy duration value").Duration,
    5000,
  );
  for (const id of [27782, 27783, 27784])
    assert(
      source.summary.tooltipEdges.some(([parent, child]) => parent === 450608 && child === id),
    );
  assert.equal(
    one(tables.Spell, (row) => row.id === 450608, "Wildheart description").Description_lang,
    "Chance on spellcast to restore $27782s1 Mana, on melee attack to regenerate $27784o1 Energy over $27784d, and when struck by a melee attack to generate ${$27783s1/10} Rage.",
  );
  return {
    schema: "kfc-druid-wildheart-rules.v1",
    setId: 185,
    threshold: 5,
    mana: 200,
    rage: 10,
    energy: { perTick: 4, tickMs: 1000, durationMs: 5000 },
    referenceManaChance: 0.02,
    clientDummyChance: 1,
    serverProcRateVerified: false,
    eventEligibilityVerified: false,
    unchangedNonHealingResourceImplementation: true,
    publicationAllowed: false,
  };
}

/** Declared alternatives keep dummy metadata distinct from observed server behavior.
 * @returns {ReadonlyArray<Readonly<object>>}
 */
export function druidWildheartEquipmentPolicies() {
  const reference = {
    schema: "kfc-druid-healing-equipment-policy.v1",
    id: "wildheart-reference",
    wildheartManaProcChance: 0.02,
    wildheartHealingEvents: "completed-casts",
  };
  return Object.freeze(
    [
      reference,
      ...[0, 0.05, 0.1, 1].map((chance) => ({
        ...reference,
        id: "wildheart-rate-" + chance,
        wildheartManaProcChance: chance,
      })),
      { ...reference, id: "wildheart-direct-heals", wildheartHealingEvents: "direct-heals" },
    ].map((row) => Object.freeze(row)),
  );
}

/** Derive exact dispatch and an actor-owned policy without changing frozen ancestors.
 * @param {{dispatch:string,bounty:string,baseline:string,workload:string}} source
 * @returns {{dispatch:string,bounty:string,baseline:string,workload:string}}
 */
export function renderDruidWildheartModel(source) {
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  const dispatch = once(
    source.dispatch,
    '\t{186, "Beaststalker Armor"},',
    '\t{186, "Beaststalker Armor"},\n\t{185, "Wildheart Raiment"},',
  );
  const start = source.bounty.indexOf(
    '\tcore.MakeProcTriggerAura(&c.Unit, core.ProcTrigger{\n\t\tActionID: actionID, Name: "Nature\'s Bounty (Mana)"',
  );
  assert(start >= 0);
  const end = source.bounty.indexOf("\n\tcore.MakeProcTriggerAura", start + 1);
  assert(end > start);
  const block = source.bounty.slice(start, end);
  assert(block.includes("ProcChance: 0.02") && block.includes("c.AddMana(sim, 200, manaMetrics)"));
  const bounty = once(
    source.bounty,
    block,
    "\tapplyKFCWildheartMana(agent, actionID, manaMetrics)",
  );
  const baseline = once(
    source.baseline,
    "research *kfcDruidHealingResearchState",
    "research *kfcDruidHealingResearchState\n\tequipmentPolicy *KFCDruidHealingEquipmentPolicy",
  );
  let workload = once(
    source.workload,
    "type KFCDruidHealingWorkload struct {",
    'type KFCDruidHealingWorkload struct {\n\tEquipmentPolicy *KFCDruidHealingEquipmentPolicy `json:"equipmentPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCDruidHealingWorkloadResult struct {",
    'type KFCDruidHealingWorkloadResult struct {\n\tEquipmentPolicy *KFCDruidHealingEquipmentPolicy `json:"equipmentPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "\tpositions := map[int32]KFCDruidFriendlyPosition{}",
    "\tif frame.EquipmentPolicy != nil { if err = healer.ConfigureKFCDruidHealingEquipment(*frame.EquipmentPolicy); err != nil {return nil,err} }\n\tpositions := map[int32]KFCDruidFriendlyPosition{}",
  );
  workload = once(
    workload,
    "\tfor iteration := int32(0);",
    "\tif frame.EquipmentPolicy != nil || healer.kfcHasWildheartManaSet() { policy := healer.kfcResolvedEquipmentPolicy(); output.EquipmentPolicy = &policy }\n\tfor iteration := int32(0);",
  );
  return { dispatch, bounty, baseline, workload };
}
