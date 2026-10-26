import assert from "node:assert/strict";
import { reviewShamanActiveItemScope } from "./shaman-active-item-scope.mjs";

const ids = [8367, 10030, 10543, 10721, 13164, 18340, 18638, 18639, 272437];
const one = (rows, predicate, label) => {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
};

/** Extract all nine owned protective uses from the reviewed current client closure.
 * @param {object} source @returns {object}
 */
export function extractShamanProtectiveItemRules(source) {
  const scope = reviewShamanActiveItemScope(source);
  assert.deepEqual(scope.remainingRelevantItemIds, ids);
  const items = ids.map((id) => {
    const decision = scope.decisions.find((row) => row.itemId === id);
    const use = decision.itemUse,
      effects = decision.clientEffects;
    const misc = one(
      source.tables.SpellMisc,
      (row) => row.SpellID === use.SpellID,
      "Protective spell metadata",
    );
    const cast = one(
      source.tables.SpellCastTimes,
      (row) => row.id === misc.CastingTimeIndex,
      "Protective cast time",
    );
    assert.equal(cast.Base, 0);
    assert.equal(use.Charges, 0);
    assert(use.CoolDownMSec > 0 && Number.isSafeInteger(use.CoolDownMSec));
    assert(
      decision.duration.Duration > 0 &&
        decision.duration.Duration === decision.duration.MaxDuration &&
        decision.duration.DurationPerResource === 0,
    );
    for (const effect of effects) {
      assert.deepEqual(
        [
          effect.EffectBonusCoefficient,
          effect.BonusCoefficientFromAP,
          effect.EffectRealPointsPerLevel,
          effect.EffectAuraPeriod,
          effect.EffectTriggerSpell,
        ],
        [0, 0, 0, 0, 0],
      );
      assert(Number.isFinite(effect.EffectBasePointsF) && effect.EffectBasePointsF > 0);
      assert(Number.isFinite(effect.Variance) && effect.Variance >= 0 && effect.Variance <= 1);
    }
    const cooldowns = source.tables.SpellCooldowns.filter((row) => row.SpellID === use.SpellID);
    const categories = source.tables.SpellCategories.filter((row) => row.SpellID === use.SpellID);
    assert(cooldowns.length <= 1 && categories.length <= 1);
    assert.equal(cooldowns[0]?.StartRecoveryTime ?? 0, 0);
    const inherit = use.CategoryCoolDownMSec < 0;
    const sharedMs = inherit ? (cooldowns[0]?.CategoryRecoveryTime ?? 0) : use.CategoryCoolDownMSec;
    const sharedCategory = inherit
      ? use.SpellCategoryID || categories[0]?.Category || 0
      : use.SpellCategoryID;
    const row = {
      itemId: id,
      spellId: use.SpellID,
      kind: decision.kind,
      spellSchoolMask: misc.SchoolMask,
      amount: effects[0].EffectBasePointsF,
      variance: effects[0].Variance,
      poolSchoolMask: effects[0].EffectAura === 69 ? effects[0].EffectMiscValue[0] : 0,
      durationMs: decision.duration.Duration,
      cooldownMs: use.CoolDownMSec,
      sharedCategory: sharedMs > 0 ? sharedCategory : 0,
      sharedCooldownMs: sharedMs,
      radius: id === 10030 ? decision.radius[0].Radius : 0,
      engineeringRequired: [10543, 10721, 18638, 18639].includes(id),
    };
    assert(
      Number.isInteger(row.spellSchoolMask) &&
        row.spellSchoolMask > 0 &&
        row.spellSchoolMask <= 127,
    );
    if (effects[0].EffectAura === 69) assert(row.poolSchoolMask > 0 && row.poolSchoolMask <= 127);
    if (id === 13164)
      assert.deepEqual(
        effects.map((entry) => [entry.EffectAura, entry.EffectBasePointsF]),
        [
          [15, 20],
          [22, 20],
        ],
      );
    if (id === 10721) {
      assert.deepEqual(
        decision.auraOptions.map((entry) => [entry.ProcChance, ...entry.ProcTypeMask]),
        [[5, 139944, 0]],
      );
      row.overloadProcChanceInClient = 5;
      row.overloadPayloadVerified = false;
    }
    if (id === 272437) {
      const explosion = one(
        source.tables.SpellEffect,
        (entry) => entry.SpellID === 1291099,
        "Adaptive explosion",
      );
      assert.deepEqual(
        [
          explosion.Effect,
          explosion.EffectAura,
          explosion.EffectBonusCoefficient,
          ...explosion.ImplicitTarget,
        ],
        [2, 0, 0, 18, 16],
      );
      const radius = one(
        source.tables.SpellRadius,
        (entry) => entry.id === explosion.EffectRadiusIndex[1],
        "Adaptive radius",
      );
      row.explosion = {
        spellId: 1291099,
        amount: explosion.EffectBasePointsF,
        variance: explosion.Variance,
        radius: radius.Radius,
      };
    }
    return row;
  });
  return {
    schema: "kfc-shaman-protective-item-rules.v1",
    sourceBuild: 70532,
    cooldownReference: "item-override-inherits-negative-reference",
    items,
    serverMechanicsVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Validate explicit owned sensitivities without supplying unknown server behavior.
 * @param {unknown} value @returns {void}
 */
export function assertShamanProtectiveItemPolicy(value) {
  assert(value && typeof value === "object" && !Array.isArray(value));
  assert.equal(value.schema, "kfc-shaman-protective-policy.v1");
  assert.equal(typeof value.id, "string");
  assert(value.id.length > 0 && value.id.length <= 100);
  assert.equal(value.cooldowns, "item-override-inherits-negative-reference");
  const keys = new Set([
    "schema",
    "id",
    "cooldowns",
    "admiralStamina",
    "admiralHealth",
    "admiralRecipientHealth",
    "harmBelt",
    "selfReflection",
    "adaptiveEnemyInMelee",
    "adaptiveOutcome",
  ]);
  assert(Object.keys(value).every((key) => keys.has(key)));
  if (value.admiralStamina !== undefined)
    assert(["disabled-reference", "additive-reference"].includes(value.admiralStamina));
  if (value.admiralHealth !== undefined)
    assert(["maximum-only-reference", "grant-on-gain-reference"].includes(value.admiralHealth));
  if (value.harmBelt !== undefined)
    assert(["disabled-use-reference", "no-overload-reference"].includes(value.harmBelt));
  if (value.selfReflection !== undefined)
    assert.equal(value.selfReflection, "self-ineligible-reference");
  if (value.adaptiveEnemyInMelee !== undefined)
    assert.equal(typeof value.adaptiveEnemyInMelee, "boolean");
  if (value.adaptiveOutcome !== undefined)
    assert.equal(value.adaptiveOutcome, "noncritical-hit-reference");
  if (value.admiralRecipientHealth !== undefined)
    assert.equal(value.admiralRecipientHealth, "ten-health-per-stamina-reference");
  assert.equal(value.admiralStamina === "additive-reference", value.admiralHealth !== undefined);
  assert.equal(
    value.admiralStamina === "additive-reference",
    value.admiralRecipientHealth !== undefined,
  );
  assert.equal(value.adaptiveEnemyInMelee !== undefined, value.adaptiveOutcome !== undefined);
}

/** Derive only references required by the items actually equipped.
 * @param {ReadonlyArray<number>} itemIds @returns {ReadonlyArray<object>}
 */
export function shamanProtectiveItemPolicies(itemIds) {
  assert(Array.isArray(itemIds) && itemIds.every((id) => Number.isSafeInteger(id) && id >= 0));
  const owned = new Set(itemIds);
  if (!ids.some((id) => owned.has(id))) return Object.freeze([]);
  const policies = [];
  for (const admiral of owned.has(10030)
    ? ["disabled-reference", "additive-reference"]
    : [undefined]) {
    for (const health of admiral === "additive-reference"
      ? ["maximum-only-reference", "grant-on-gain-reference"]
      : [undefined]) {
      for (const belt of owned.has(10721)
        ? ["disabled-use-reference", "no-overload-reference"]
        : [undefined]) {
        for (const melee of owned.has(272437) ? [false, true] : [undefined]) {
          const policy = {
            schema: "kfc-shaman-protective-policy.v1",
            id: `admiral-${admiral ?? "absent"}-${health ?? "absent"}-belt-${belt ?? "absent"}-melee-${melee ?? "absent"}`,
            cooldowns: "item-override-inherits-negative-reference",
            ...(admiral === undefined ? {} : { admiralStamina: admiral }),
            ...(health === undefined ? {} : { admiralHealth: health }),
            ...(health === undefined
              ? {}
              : { admiralRecipientHealth: "ten-health-per-stamina-reference" }),
            ...(belt === undefined ? {} : { harmBelt: belt }),
            ...(owned.has(18638) || owned.has(18639)
              ? { selfReflection: "self-ineligible-reference" }
              : {}),
            ...(melee === undefined
              ? {}
              : { adaptiveEnemyInMelee: melee, adaptiveOutcome: "noncritical-hit-reference" }),
          };
          assertShamanProtectiveItemPolicy(policy);
          policies.push(Object.freeze(policy));
        }
      }
    }
  }
  return Object.freeze(policies);
}

function once(source, before, after) {
  assert.equal(source.split(before).length, 2, "Protective integration anchor: " + before);
  return source.replace(before, after);
}

/** Add owned effects, explicit use dispatch and non-healing health accounting.
 * @param {{actor:string,equipped:string,definitions:string,runner:string,testHelpers:string}} sources
 * @returns {{actor:string,equipped:string,definitions:string,runner:string,testHelpers:string}}
 */
export function renderShamanProtectiveItems(sources) {
  assert(!sources.actor.includes("kfcProtectiveItems"));
  let actor = once(
    sources.actor,
    "type RestorationShaman struct {",
    "type RestorationShaman struct {\n\tkfcProtectiveItems *kfcShamanProtectiveItems",
  );
  actor = once(
    actor,
    "\tresto.registerKFCShamanLegacyItems()",
    "\tresto.registerKFCShamanLegacyItems()\n\tresto.registerKFCShamanProtectiveItems()",
  );
  let equipped = once(
    sources.equipped,
    "type KFCShamanEquippedEffects struct {",
    'type KFCShamanEquippedEffects struct {\n\tProtective *KFCShamanProtectivePolicy `json:"protective,omitempty"`',
  );
  equipped = once(
    equipped,
    "\trelic := resto.kfcRelics",
    '\tif (resto.kfcProtectiveItems!=nil && len(resto.kfcProtectiveItems.owned)>0)!=(effects.Protective!=nil) {return fmt.Errorf("protective references must match owned items")}\n\tif effects.Protective!=nil {if err:=resto.ConfigureKFCShamanProtectiveItems(sim,*effects.Protective);err!=nil{return err}}\n\trelic := resto.kfcRelics',
  );
  equipped = once(
    equipped,
    "\tswitch itemID {",
    "\tswitch itemID {\n\tcase 8367,10030,10543,10721,13164,18340,18638,18639,272437:\n\t\treturn resto.kfcProtectiveItems.spells[itemID]",
  );
  const definitions = once(
    sources.definitions,
    "type KFCShamanHealingAssignmentMetrics struct {",
    'type KFCShamanHealingAssignmentMetrics struct {\n\tExternalNonHealingDeficitAdjustmentMean float64 `json:"externalNonHealingDeficitAdjustmentMean,omitempty"`',
  );
  let runner = once(
    sources.runner,
    "\t\thealthLoss, absorbed, overkill := 0.0, 0.0, 0.0",
    "\t\thealthLoss, absorbed, overkill := 0.0, 0.0, 0.0\n\t\thealthLossByRaidIndex:=map[int32]float64{}",
  );
  runner = once(
    runner,
    "\t\t\t\thealthLoss += loss",
    "\t\t\t\thealthLoss += loss\n\t\t\t\thealthLossByRaidIndex[event.RaidIndex]+=loss",
  );
  runner = once(
    runner,
    "\t\thealed := healthLoss - finalMissing",
    '\t\tadjustment,healed:=0.0,0.0\n\t\tif healer.kfcProtectiveItems!=nil {adjustment=healer.kfcProtectiveItems.externalDeficitAdjustment}\n\t\tassignment.ExternalNonHealingDeficitAdjustmentMean+=adjustment\n\t\tfor _,unit:=range healer.kfcHealingPlayers(){if unit==&healer.Unit {continue};loss:=healthLossByRaidIndex[unit.Index];shift:=0.0;if healer.kfcProtectiveItems!=nil {shift=healer.kfcProtectiveItems.externalDeficitByRaidIndex[unit.Index]};net:=loss+shift-max(0,unit.MaxHealth()-unit.CurrentHealth());if !kfcFinite(net)||net < -1e-7 {return nil,fmt.Errorf("inconsistent Shaman recipient demand ledger")};healed+=min(loss,max(0,net))}',
  );
  runner = once(
    runner,
    "\tassignment.HealthRestoredHpsMean /= countFloat",
    "\tassignment.ExternalNonHealingDeficitAdjustmentMean /= countFloat\n\tassignment.HealthRestoredHpsMean /= countFloat",
  );
  const testHelpers = once(
    sources.testHelpers,
    "\tframe.Effects = effects",
    "\tfor id:=range ids {if kfcShamanProtectiveItemIDs[id] {policy:=kfcShamanProtectiveTestPolicy(ids);effects.Protective=&policy;break}}\n\tframe.Effects = effects",
  );
  return { actor, equipped, definitions, runner, testHelpers };
}
