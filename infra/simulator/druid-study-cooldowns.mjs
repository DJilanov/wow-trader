import assert from "node:assert/strict";

/** Authenticate the existing common handler before allowing its explicit use by healers.
 * @param {object} source @param {string} common @returns {object}
 */
export function extractDruidStudyCooldownRules(source, common) {
  assert.equal(source.schema, "kfc-druid-study-cooldown-source.v1");
  assert.equal(source.source.clientVersion, "1.60.1.70532");
  const one = (name) => {
    assert.equal(source.tables[name].length, 1, name);
    return source.tables[name][0];
  };
  const link = one("ItemXItemEffect"),
    item = one("ItemEffect"),
    effect = one("SpellEffect"),
    misc = one("SpellMisc"),
    duration = one("SpellDuration");
  assert.deepEqual([link.ItemID, link.ItemEffectID, item.id], [272439, 232253, 232253]);
  assert.deepEqual(
    [
      item.SpellID,
      item.TriggerType,
      item.CoolDownMSec,
      item.CategoryCoolDownMSec,
      item.SpellCategoryID,
      item.ChrSpecializationID,
      item.PlayerConditionID,
      item.Charges,
    ],
    [1291103, 0, 90000, 15000, 1141, 0, 0, 0],
  );
  assert.deepEqual(
    [
      effect.SpellID,
      effect.Effect,
      effect.EffectAura,
      effect.EffectBasePointsF,
      effect.EffectMiscValue,
      effect.ImplicitTarget,
    ],
    [1291103, 6, 29, 72, [4, 0], [1, 0]],
  );
  assert.deepEqual(effect.EffectSpellClassMask, [0, 0, 0, 0]);
  for (const field of [
    "EffectTriggerSpell",
    "EffectAuraPeriod",
    "EffectBonusCoefficient",
    "Variance",
    "ScalingClass",
    "Coefficient",
    "ResourceCoefficient",
  ])
    assert.equal(effect[field], 0);
  assert.deepEqual(
    [misc.SpellID, misc.DurationIndex, duration.id, duration.Duration, duration.MaxDuration],
    [1291103, 8, 8, 15000, 15000],
  );
  assert(
    common.includes(
      "core.NewSimpleStatOffensiveTrinketEffect(272439,\n\t\tstats.Stats{stats.Spirit: 72}, 15*time.Second, 90*time.Second)",
    ),
  );
  return {
    schema: "kfc-druid-study-cooldown-rules.v1",
    itemId: 272439,
    actionSelector: "itemId",
    sourceSpellId: 1291103,
    spirit: 72,
    durationMs: 15000,
    cooldownMs: 90000,
    sharedCategory: 1141,
    sharedDurationMs: 15000,
    implicitActivation: false,
    ownedEffectRequired: true,
    usesExistingCommonHandler: true,
    publicationAllowed: false,
  };
}

/** @param {string} source @returns {string} */
export function renderDruidStudyCooldowns(source) {
  const anchor = "case 3827, 6149, 4381, 12662, 13443, 13444:";
  assert.equal(source.split(anchor).length, 2);
  return source.replace(anchor, "case 3827, 6149, 4381, 12662, 13443, 13444, 272439:");
}
