import assert from "node:assert/strict";

/** Validate current item payloads while retaining historical base-stat uncertainty.
 * @param {object} source @returns {object}
 */
export function extractDruidItemResources(source) {
  assert.equal(source.schema, "kfc-druid-item-resources-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  const { tables } = source;
  function one(name, predicate) {
    const rows = tables[name].filter(predicate);
    assert.equal(rows.length, 1, name);
    return rows[0];
  }
  for (const [id, spell, trigger, cooldown, shared] of [
    [18371, 1302205, 0, 420000, 10000],
    [11819, 15604, 0, 900000, 10000],
    [249473, 1249118, 1, -1, -1],
    [18321, 1302190, 1, -1, -1],
  ]) {
    const link = one("ItemXItemEffect", (row) => row.ItemID === id);
    const effect = one("ItemEffect", (row) => row.id === link.ItemEffectID);
    assert.deepEqual(
      [effect.SpellID, effect.TriggerType, effect.CoolDownMSec, effect.CategoryCoolDownMSec],
      [spell, trigger, cooldown, shared],
    );
    assert.equal(effect.SpellCategoryID, trigger === 0 ? 2554 : 0);
    assert.equal(effect.PlayerConditionID, 0);
    assert.equal(effect.ChrSpecializationID, 0);
  }
  const expected = [
    [1302205, 0, 6, 24, 125, 0, 0, 1000, 0],
    [1302205, 1, 64, 0, 0, 1302206, 0, 0, 0],
    [1302206, 0, 6, 29, -60, 0, 0, 0, 3],
    [15604, 0, 6, 24, 63, 0, 0, 1000, 0],
    [1249118, 0, 6, 42, 0, 1249119, 0, 0, 0],
    [1249119, 0, 6, 135, 40, 0, 1, 0, 126],
    [1249119, 1, 6, 13, 13, 0, 1, 0, 126],
    [1302190, 0, 6, 42, 0, 1302191, 0, 0, 0],
    [1302191, 0, 30, 0, 48, 0, 0, 0, 0],
  ];
  assert.equal(tables.SpellEffect.length, expected.length);
  for (const values of expected) {
    const row = one(
      "SpellEffect",
      (row) => row.SpellID === values[0] && row.EffectIndex === values[1],
    );
    assert.deepEqual(
      [
        row.SpellID,
        row.EffectIndex,
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectTriggerSpell,
        row.EffectBonusCoefficient,
        row.EffectAuraPeriod,
        row.EffectMiscValue[0],
      ],
      values,
    );
    assert.deepEqual(row.ImplicitTarget, [1, 0]);
    assert.equal(row.EffectMiscValue[1], 0);
    assert.equal(row.Variance, row.SpellID === 1249118 ? 0.5 : 0);
    for (const field of [
      "EffectRealPointsPerLevel",
      "BonusCoefficientFromAP",
      "Coefficient",
      "ResourceCoefficient",
      "ScalingClass",
    ])
      assert.equal(row[field], 0);
  }
  for (const [id, milliseconds] of [
    [1302205, 10000],
    [1302206, 120000],
    [15604, 10000],
    [1249119, 15000],
  ]) {
    const misc = one("SpellMisc", (row) => row.SpellID === id);
    const duration = one("SpellDuration", (row) => row.id === misc.DurationIndex);
    assert.equal(duration.Duration, milliseconds);
    assert.equal(duration.MaxDuration, milliseconds);
  }
  for (const [id, mask] of [
    [1249118, 16384],
    [1302190, 65536],
  ]) {
    const proc = one("SpellAuraOptions", (row) => row.SpellID === id);
    assert.deepEqual(
      [proc.ProcChance, proc.ProcTypeMask, proc.ProcCategoryRecovery],
      [100, [mask, 0], 0],
    );
  }
  return {
    schema: "kfc-druid-item-resources-rules.v1",
    mindtap: {
      itemId: 18371,
      spellId: 1302205,
      manaPerTick: 125,
      ticks: 10,
      tickMs: 1000,
      cooldownMs: 420000,
      sharedCategory: 2554,
      sharedCooldownMs: 10000,
      penaltySpellId: 1302206,
      intellectPenalty: 60,
      penaltyDurationMs: 120000,
    },
    dormantHeart: {
      itemId: 249473,
      triggerSpellId: 1249118,
      buffSpellId: 1249119,
      healingPower: 40,
      spellDamage: 13,
      durationMs: 15000,
      literalChance: 1,
      serverChanceVerified: false,
    },
    energeticRod: { itemId: 18321, triggerMask: 65536, mana: 48, offensiveWeavingAdmitted: false },
    assumptions: {
      mindtapManaCap:
        "clamp current mana to the reduced maximum on activation; expiration restores capacity without granting mana",
      heart: "chance and cast-versus-direct-heal interpretation are explicit sensitivity policies",
    },
    baseStatsRemainProvisionalItemIds: source.baseStatsRemainProvisionalItemIds,
    scope: "restoration-druid-only",
    publicationAllowed: false,
  };
}

/** Literal client metadata is a reference, not observed server proc behavior.
 * @returns {ReadonlyArray<Readonly<object>>}
 */
export function druidItemResourcePolicies() {
  const reference = {
    schema: "kfc-druid-item-effects-policy.v1",
    id: "heart-client-literal",
    dormantHeartProcChance: 1,
    dormantHeartHealingEvents: "completed-casts",
  };
  return Object.freeze(
    [
      reference,
      ...[0, 0.02, 0.05, 0.1].map((chance) => ({
        ...reference,
        id: "heart-rate-" + chance,
        dormantHeartProcChance: chance,
      })),
      { ...reference, id: "heart-direct-heals", dormantHeartHealingEvents: "direct-heals" },
    ].map((row) => Object.freeze(row)),
  );
}

/** Derive class-scoped initialization, owned cooldown admission and policy transport.
 * @param {{baseline:string,workload:string,cooldowns:string}} source
 * @returns {{baseline:string,workload:string,cooldowns:string}}
 */
export function renderDruidItemResources(source) {
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  let baseline = once(
    source.baseline,
    "selfEffects *kfcDruidSelfEffects",
    "selfEffects *kfcDruidSelfEffects\n\titemEffects *kfcDruidItemEffects",
  );
  baseline = once(
    baseline,
    "\tresto.registerKFCSelfEffects()",
    "\tresto.registerKFCSelfEffects()\n\tresto.registerKFCItemResources()",
  );
  let workload = once(
    source.workload,
    "type KFCDruidHealingWorkload struct {",
    'type KFCDruidHealingWorkload struct {\n\tItemEffectsPolicy *KFCDruidItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCDruidHealingWorkloadResult struct {",
    'type KFCDruidHealingWorkloadResult struct {\n\tItemEffectsPolicy *KFCDruidItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "\tpositions := map[int32]KFCDruidFriendlyPosition{}",
    "\tif frame.ItemEffectsPolicy != nil { if err = healer.ConfigureKFCDruidItemEffects(*frame.ItemEffectsPolicy); err != nil { return nil,err } }\n\tpositions := map[int32]KFCDruidFriendlyPosition{}",
  );
  workload = once(
    workload,
    "\toutput.CasterDamageEnabled = frame.AllowCasterDamage",
    "\tif frame.ItemEffectsPolicy != nil || healer.itemEffects.hasAny { policy := healer.kfcResolvedItemEffectsPolicy(); output.ItemEffectsPolicy = &policy }\n\toutput.CasterDamageEnabled = frame.AllowCasterDamage",
  );
  const cooldowns = once(
    source.cooldowns,
    "reviewed := policy.SpellID == 15604 || policy.SpellID == 20554",
    "reviewed := policy.SpellID == 15604 || policy.SpellID == 1302205 || policy.SpellID == 20554",
  );
  return { baseline, workload, cooldowns };
}
