import assert from "node:assert/strict";

/** Authenticate the cast proc and derive the nonperiodic critical-effect boundary.
 * @param {object} source @returns {{cooldowns:string,forever:string,rules:object}}
 */
export function renderPaladinCastCritItems(source) {
  assert.equal(source.schema, "kfc-paladin-cast-crit-items-source.v1");
  assert.equal(source.source.clientVersion, "1.60.1.70532");
  assert.equal(source.source.buildNumber, 70532);
  assert.equal(source.serverMechanicsVerified, false);
  const one = (name, predicate) => {
    const rows = source.tables[name].filter(predicate);
    assert.equal(rows.length, 1, name);
    return rows[0];
  };
  const item = (id) => {
    const link = one("ItemXItemEffect", (row) => row.ItemID === id);
    const result = one("ItemEffect", (row) => row.id === link.ItemEffectID);
    assert.equal(result.ChrSpecializationID, 0);
    assert.equal(result.PlayerConditionID, 0);
    return result;
  };
  const effect = (id) => one("SpellEffect", (row) => row.SpellID === id);
  const duration = (id) => {
    const misc = one("SpellMisc", (row) => row.SpellID === id);
    const result = one("SpellDuration", (row) => row.id === misc.DurationIndex);
    assert.equal(result.DurationPerResource, 0);
    assert.equal(result.Duration, result.MaxDuration);
    return result.Duration;
  };
  assert.equal(source.tables.ItemXItemEffect.length, 2);
  assert.equal(source.tables.ItemEffect.length, 2);
  assert.equal(source.tables.SpellEffect.length, 3);
  const dragon = item(19288),
    trigger = effect(23688),
    spirit = effect(23684),
    proc = one("SpellAuraOptions", (row) => row.SpellID === 23688),
    analyzer = item(272438),
    critical = effect(1291101),
    charges = one("SpellAuraOptions", (row) => row.SpellID === 1291101);
  assert.deepEqual([dragon.SpellID, dragon.TriggerType], [23688, 1]);
  assert.deepEqual(
    [trigger.Effect, trigger.EffectAura, trigger.EffectTriggerSpell],
    [6, 42, 23684],
  );
  assert.equal(proc.ProcChance, 2);
  assert.deepEqual(proc.ProcTypeMask, [81920, 0]);
  assert.deepEqual(
    [spirit.Effect, spirit.EffectAura, spirit.EffectBasePointsF, spirit.EffectMiscValue],
    [6, 29, 150, [4, 0]],
  );
  assert.equal(spirit.Variance, 0);
  assert.equal(spirit.EffectRealPointsPerLevel, 0);
  assert.equal(duration(23684), 15000);
  assert.deepEqual(
    [
      analyzer.SpellID,
      analyzer.TriggerType,
      analyzer.CoolDownMSec,
      analyzer.CategoryCoolDownMSec,
      analyzer.SpellCategoryID,
      analyzer.Charges,
    ],
    [1291101, 0, 90000, 20000, 1141, 0],
  );
  assert.deepEqual(
    [
      critical.Effect,
      critical.EffectAura,
      critical.EffectBasePointsF,
      critical.Variance,
      critical.EffectBonusCoefficient,
      critical.EffectTriggerSpell,
    ],
    [6, 290, 5, 0, 0, 0],
  );
  assert.deepEqual([charges.CumulativeAura, charges.ProcCharges], [1, 1]);
  assert.equal(duration(1291101), 20000);
  const dragonStart = source.common.indexOf("core.NewItemEffect(DarkmoonCardBlueDragon,");
  assert(dragonStart > 0);
  const dragonHandler = source.common.slice(
    dragonStart,
    source.common.indexOf("\n\t//", dragonStart),
  );
  for (const fragment of [
    "stats.Stats{stats.Spirit: 150}, time.Second*15)",
    "Callback: core.CallbackOnCastComplete",
    "ProcMask: core.ProcMaskSpellDamage | core.ProcMaskSpellHealing",
    "ProcChance: .02",
    "procAura.Activate(sim)",
  ])
    assert(dragonHandler.includes(fragment), fragment);
  assert(!dragonHandler.includes("AttachSpiritRegenRateCastingBuff"));
  for (const fragment of [
    "core.NewSimpleStatOffensiveTrinketEffectWithOtherEffects(272438,",
    "stats.Stats{stats.MeleeCrit: 5, stats.SpellCrit: 5}, 20*time.Second, 90*time.Second",
    "if result.DidCrit()",
    "aura.Deactivate(sim)",
    "aura.OnHealDealt = consume",
    "aura.OnSpellHitDealt = consume",
  ])
    assert(source.forever.includes(fragment), fragment);
  const anchor = "case 3827, 6149, 4381, 12662, 13443, 13444, 272439:";
  assert.equal(source.cooldowns.split(anchor).length, 2);
  assert(source.cooldowns.includes("healer.GetInitialMajorCooldown(actionID).Spell == nil"));
  const criticalGuard = "if result.DidCrit() {";
  assert.equal(source.forever.split(criticalGuard).length, 2);
  return {
    cooldowns: source.cooldowns.replace(anchor, anchor.replace("272439:", "272439, 272438:")),
    forever: source.forever.replace(
      criticalGuard,
      "if result.DirectDamageOrHealing && result.DidCrit() {",
    ),
    rules: {
      schema: "kfc-paladin-cast-crit-items-rules.v1",
      sourceBuild: 70532,
      blueDragon: {
        itemId: 19288,
        procChance: 0.02,
        spirit: 150,
        durationMs: 15000,
        event: "eligible-completed-cast",
        stacking: "refresh-only",
        usesExistingCommonHandler: true,
      },
      analyzer: {
        itemId: 272438,
        sourceSpellId: 1291101,
        critPercentagePoints: 5,
        durationMs: 20000,
        cooldownMs: 90000,
        sharedCooldownMs: 20000,
        sharedCategory: 1141,
        consumedBy: "nonperiodic-critical-effect",
        explicitOwnedUse: true,
        usesExistingCommonHandler: true,
        legacyPeriodicCallbackGuardCorrected: true,
      },
      serverMechanicsVerified: false,
      currentBaseStatsVerified: false,
      publicationAllowed: false,
    },
  };
}
