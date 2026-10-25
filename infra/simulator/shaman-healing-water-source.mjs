import assert from "node:assert/strict";
import { extractShamanHealingActiveSource } from "./shaman-healing-active-source.mjs";

/** Bind current water-totem ranks to their exact cost and periodic talent masks.
 * @param {{evidence:object,domain:object,passives:object}} input @returns {object}
 */
export function extractShamanHealingWaterSource({ evidence, domain, passives }) {
  const active = extractShamanHealingActiveSource(evidence);
  assert.equal(domain.schema, "kfc-shaman-healing-talent-domain-source.v1");
  assert.equal(passives.schema, "kfc-shaman-healing-passive-source.v1");
  assert.equal(active.sourceBuild, domain.sourceBuild);
  assert.equal(active.sourceBuild, passives.sourceBuild);
  function spellMask(id) {
    const rows = evidence.rawTables.SpellClassOptions.filter((row) => row.SpellID === id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].SpellClassSet, 11);
    return [...rows[0].SpellClassMask];
  }
  const overlaps = (left, right) => left.some((value, index) => (value & right[index]) !== 0),
    cost = passives.talents.find((row) => row.field === "totemicFocus"),
    restorative = passives.talents.find((row) => row.field === "restorativeTotems"),
    purification = passives.talents.find((row) => row.field === "purification");
  assert(cost && restorative && purification);
  assert.deepEqual(cost.effects[0].byRank, [0, -5, -10, -15, -20, -25]);
  assert.deepEqual(restorative.effects[1].byRank, [0, 10, 20, 30, 40, 50]);
  const ranks = [
    ...active.healingStream.map((rank) => ({ ...rank, family: "healing-stream" })),
    ...active.manaTide.map((rank) => ({ ...rank, family: "mana-tide" })),
  ].map((rank) => {
    const tide = rank.family === "mana-tide",
      summonMask = spellMask(rank.id),
      pulseMask = spellMask(rank.pulseId);
    assert.deepEqual(summonMask, [tide ? 536870912 : 524288, 0, 0, 0]);
    assert.deepEqual(pulseMask, tide ? [67108864, 0, 0, 268435456] : [8192, 0, 0, 0]);
    assert(overlaps(cost.effects[0].mask, summonMask));
    assert.equal(overlaps(restorative.effects[1].mask, pulseMask), !tide);
    assert(purification.effects.every((effect) => !overlaps(effect.mask, pulseMask)));
    return {
      ...rank,
      minimumTalentLevel: tide ? 25 : 0,
      requiredLevel: Math.max(rank.requiredLevel, tide ? 25 : 0),
      summonMask,
      pulseMask,
      totemicFocusAffectsCost: true,
      restorativeTotemsAffectsPulse: !tide,
      purificationAffectsPulse: false,
    };
  });
  return {
    schema: "kfc-shaman-water-totem-source.v1",
    sourceBuild: active.sourceBuild,
    ranks,
    costReductionByRank: [...cost.effects[0].byRank],
    healingStreamBonusByRank: [...restorative.effects[1].byRank],
    serverRecipientScopeVerified: false,
    firstPulseTimingVerified: false,
    periodicCriticalRuleVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Render ranked payloads into the class-owned controller, preserving every rank.
 * @param {{implementation:string,source:object}} input @returns {string}
 */
export function renderShamanHealingWaterTotems({ implementation, source }) {
  assert.equal(source.schema, "kfc-shaman-water-totem-source.v1");
  assert.equal(source.ranks.length, 9);
  assert.equal(source.ranks.filter((row) => row.family === "healing-stream").length, 5);
  assert.equal(source.ranks.filter((row) => row.family === "mana-tide").length, 4);
  assert.equal(implementation.split("// KFC_SHAMAN_WATER_TOTEM_VALUES").length, 2);
  assert(
    source.ranks.every((rank) => rank.totemicFocusAffectsCost && !rank.purificationAffectsPulse),
  );
  return implementation.replace(
    "// KFC_SHAMAN_WATER_TOTEM_VALUES",
    "var kfcShamanWaterRanks = []kfcShamanWaterRank{" +
      source.ranks
        .map(
          (rank) =>
            `{ID:${rank.id},PulseID:${rank.pulseId},Family:${JSON.stringify(rank.family)},Rank:${rank.rank},RequiredLevel:${rank.requiredLevel},Mana:${rank.mana},Amount:${rank.amount},Coefficient:${rank.coefficient},GCDMs:${rank.gcdMs},DurationMs:${rank.durationMs},PeriodMs:${rank.periodMs},CooldownMs:${rank.sharedCooldownMs},Radius:${rank.radius}}`,
        )
        .join(",\n") +
      ",\n}\n" +
      "var kfcShamanWaterCostPercent = []float64{" +
      source.costReductionByRank.join(",") +
      "}\n" +
      "var kfcShamanWaterHealingPercent = []float64{" +
      source.healingStreamBonusByRank.join(",") +
      "}",
  );
}

/** Keep existing DPS dispatch unchanged by guarding the replacement behind a default-false class flag.
 * @param {{shaman:string,baseline:string,passives:string}} input @returns {object}
 */
export function integrateShamanHealingWaterTotems({ shaman, baseline, passives }) {
  function once(source, before, after) {
    assert.equal(source.split(before).length, 2, "Unknown water-totem integration boundary");
    return source.replace(before, after);
  }
  shaman = once(
    shaman,
    "\tTalents *proto.ShamanTalents",
    "\tKFCControlledWaterTotems bool\n\tTalents *proto.ShamanTalents",
  );
  for (const method of ["registerHealingStreamTotemSpell", "registerManaTideTotemSpell"])
    shaman = once(
      shaman,
      "\tshaman." + method + "()",
      "\tif !shaman.KFCControlledWaterTotems { shaman." + method + "() }",
    );
  baseline = once(
    baseline,
    "\tchainRouting string",
    "\tchainRouting string\n\tkfcWater *kfcShamanWaterController",
  );
  baseline = once(
    baseline,
    "func (resto *RestorationShaman) Reset(sim *core.Simulation) { resto.Shaman.Reset(sim) }",
    "func (resto *RestorationShaman) Reset(sim *core.Simulation) { resto.Shaman.Reset(sim); resto.resetKFCShamanWaterTotems() }",
  );
  baseline = once(
    baseline,
    "\tresto.Shaman.Initialize()",
    "\tresto.KFCControlledWaterTotems = true\n\tresto.Shaman.Initialize()",
  );
  baseline = once(
    baseline,
    "\tfor _, rank := range kfcShamanHealingRanks {",
    "\tresto.registerKFCShamanWaterTotems()\n\tfor _, rank := range kfcShamanHealingRanks {",
  );
  passives = once(
    passives,
    "\t\tdefinition, ok := kfcShamanPassiveDefinitions[string(field.Name())]",
    "\t\tif kfcShamanWaterTalentAllowed(field, value) { return true }\n\t\tdefinition, ok := kfcShamanPassiveDefinitions[string(field.Name())]",
  );
  return { shaman, baseline, passives };
}
