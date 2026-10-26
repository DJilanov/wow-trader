import assert from "node:assert/strict";
import { reviewShamanSharedEquipmentSource } from "./shaman-shared-equipment-source.mjs";

function one(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
}

/** Bind the existing shared handlers to Shaman's captured current item graph.
 * @param {{evidence:object,common:string,forever:string}} input @returns {object}
 */
export function extractShamanCastCritItems(input) {
  reviewShamanSharedEquipmentSource(input.evidence);
  const { tables, lookups } = input.evidence;
  const linked = (id) => {
    const link = one(tables.ItemXItemEffect, (row) => row.ItemID === id, "Cast/crit item link");
    const effect = one(
      tables.ItemEffect,
      (row) => row.id === link.ItemEffectID,
      "Cast/crit item effect",
    );
    assert.deepEqual(
      [effect.PlayerConditionID, effect.ChrSpecializationID, effect.Charges],
      [0, 0, 0],
    );
    return effect;
  };
  const effect = (id) =>
    one(tables.SpellEffect, (row) => row.SpellID === id, "Cast/crit spell payload");
  const duration = (id) => {
    const misc = one(tables.SpellMisc, (row) => row.SpellID === id, "Cast/crit duration link");
    const row = one(
      lookups.SpellDuration,
      (row) => row.id === misc.DurationIndex,
      "Cast/crit duration",
    );
    assert.equal(row.Duration, row.MaxDuration);
    assert.equal(row.DurationPerResource, 0);
    return row.Duration;
  };
  const dragon = linked(19288),
    analyzer = linked(272438);
  assert.deepEqual([dragon.SpellID, dragon.TriggerType], [23688, 1]);
  const root = effect(23688),
    spirit = effect(23684);
  assert.deepEqual(
    [root.Effect, root.EffectAura, root.EffectTriggerSpell, root.ImplicitTarget],
    [6, 42, 23684, [1, 0]],
  );
  assert.deepEqual(
    [
      spirit.Effect,
      spirit.EffectAura,
      spirit.EffectBasePointsF,
      spirit.EffectMiscValue,
      spirit.EffectTriggerSpell,
    ],
    [6, 29, 150, [4, 0], 0],
  );
  const proc = one(
    tables.SpellAuraOptions,
    (row) => row.SpellID === 23688,
    "Blue Dragon proc conditions",
  );
  assert.deepEqual(
    [proc.ProcChance, proc.ProcCategoryRecovery, proc.ProcTypeMask, proc.SpellProcsPerMinuteID],
    [2, 0, [81920, 0], 0],
  );
  assert.equal(duration(23684), 15000);
  assert.deepEqual(
    [
      analyzer.SpellID,
      analyzer.TriggerType,
      analyzer.CoolDownMSec,
      analyzer.CategoryCoolDownMSec,
      analyzer.SpellCategoryID,
    ],
    [1291101, 0, 90000, 20000, 1141],
  );
  const critical = effect(1291101);
  assert.deepEqual(
    [
      critical.Effect,
      critical.EffectAura,
      critical.EffectBasePointsF,
      critical.EffectBonusCoefficient,
      critical.Variance,
      critical.EffectTriggerSpell,
    ],
    [6, 290, 5, 0, 0, 0],
  );
  const charge = one(tables.SpellAuraOptions, (row) => row.SpellID === 1291101, "Analyzer charge");
  assert.deepEqual([charge.CumulativeAura, charge.ProcCharges], [1, 1]);
  assert.equal(duration(1291101), 20000);
  const start = input.common.indexOf("core.NewItemEffect(DarkmoonCardBlueDragon,");
  const end = input.common.indexOf("\n\t})", start);
  assert(start >= 0 && end > start);
  const handler = input.common.slice(start, end);
  for (const fragment of [
    "stats.Stats{stats.Spirit: 150}, time.Second*15)",
    "Callback: core.CallbackOnCastComplete",
    "ProcMask: core.ProcMaskSpellDamage | core.ProcMaskSpellHealing",
    "ProcChance: .02",
    "procAura.Activate(sim)",
  ])
    assert(handler.includes(fragment), fragment);
  assert(!handler.includes("AttachSpiritRegenRateCastingBuff"));
  const analyzerStart = input.forever.indexOf(
    "core.NewSimpleStatOffensiveTrinketEffectWithOtherEffects(272438,",
  );
  const analyzerEnd = input.forever.indexOf("\n\t\t})", analyzerStart);
  assert(analyzerStart >= 0 && analyzerEnd > analyzerStart);
  const analyzerHandler = input.forever.slice(analyzerStart, analyzerEnd);
  for (const fragment of [
    "stats.Stats{stats.MeleeCrit: 5, stats.SpellCrit: 5}, 20*time.Second, 90*time.Second",
    "if result.DirectDamageOrHealing && result.DidCrit()",
    "aura.Deactivate(sim)",
    "aura.OnSpellHitDealt = consume",
    "aura.OnHealDealt = consume",
  ])
    assert(analyzerHandler.includes(fragment), fragment);
  return {
    schema: "kfc-shaman-cast-crit-items-rules.v1",
    sourceBuild: 70532,
    blueDragon: {
      itemId: 19288,
      triggerSpellId: 23688,
      buffSpellId: 23684,
      chance: 0.02,
      spirit: 150,
      durationMs: 15000,
      event: "eligible-completed-cast",
      spiritRegenWhileCastingOverride: false,
      stacking: "refresh-only",
    },
    analyzer: {
      itemId: 272438,
      sourceSpellId: 1291101,
      critPercentagePoints: 5,
      durationMs: 20000,
      cooldownMs: 90000,
      sharedCategory: 1141,
      sharedCooldownMs: 20000,
      consumedBy: "nonperiodic-critical-effect",
      implicitActivation: false,
    },
    usesExistingCommonHandlers: true,
    currentBaseStatsVerified: false,
    serverMechanicsVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
