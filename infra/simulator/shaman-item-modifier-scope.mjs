import assert from "node:assert/strict";

const expected = [
  [2169, 134, 9], [2816, 46, 12], [5444, 113, 2], [5444, 126, 6],
  [6314, 131, 9], [6320, 46, 4], [6459, 46, 6], [6461, 46, 10],
  [6695, 136, 12], [6910, 46, 5], [7349, 112, 5], [7684, 46, 9],
  [7731, 128, 12], [10542, 113, 5], [12775, 90, 2], [14149, 46, 5],
  [17743, 46, 11], [227809, 83, 3], [249470, 83, 2], [272437, 37, 20],
];
const names = new Map([
  [37, "EXPERTISE_RATING"], [46, "HEALTH_REGEN"], [83, "PHYSICAL_DAMAGE_DONE"],
  [90, "TWOHANDED_AXES_SKILL"], [112, "HERBALISM_SKILL"], [113, "MINING_SKILL"],
  [126, "ATTACK_POWER_VS_ELEMENTAL"], [128, "ATTACK_POWER_VS_UNDEAD"],
  [131, "ATTACK_POWER_VS_BEAST"], [134, "SPELL_DAMAGE_VS_ELEMENTAL"], [136, "SPELL_DAMAGE_VS_UNDEAD"],
]);

/** Classify every previously unmapped current modifier for the stationary healing domain.
 * @param {object} evidence @returns {object}
 */
export function reviewShamanItemModifierScope(evidence) {
  assert.equal(evidence.schema, "kfc-shaman-item-modifier-scope-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.candidateCount, 2017);
  for (const key of ["serverTickTimingVerified", "catalogStatsChanged", "fullClassAdmission",
    "startsNewClassClock", "numericalQualification", "publicationAllowed"]) assert.equal(evidence[key], false);
  assert.deepEqual(evidence.modifiers.map((row) => [row.id, row.statType, row.value]), expected);
  assert.equal(evidence.items.length, 19);
  assert.equal(evidence.rawItems.length, 19);
  assert.equal(new Set(evidence.items.map((row) => row.id)).size, 19);
  assert.equal(new Set(evidence.rawItems.map((row) => row.id)).size, 19);
  assert.equal(evidence.statNames.length, names.size);
  assert.equal(new Set(evidence.statNames.map((row) => row.id)).size, names.size);
  for (const row of evidence.statNames) assert.equal(row.name, names.get(row.id));
  const labels = new Map(evidence.globals.map((row) => [row.BaseTag, row.TagText_lang]));
  assert.equal(labels.size, 3);
  assert.equal(labels.get("ITEM_MOD_HEALTH_REGEN_SHORT"), "Health Per 5 Sec.");
  for (const tag of ["ITEM_MOD_HEALTH_REGEN", "ITEM_MOD_HEALTH_REGENERATION"])
    assert.equal(labels.get(tag), "Restores %s health per 5 sec.");
  const items = new Map(evidence.items.map((item) => [item.id, item]));
  const raw = new Map(evidence.rawItems.map((item) => [item.id, item]));
  const rows = evidence.modifiers.map((modifier) => {
    const item = items.get(modifier.id), sparse = raw.get(modifier.id);
    assert(item && sparse && item.name === sparse.Display_lang);
    assert(sparse.StatModifier_bonusStat.includes(modifier.statType));
    assert.equal(item.stats.length, 44);
    const kind = modifier.statType === 46 ? "health-regeneration" :
      [112, 113].includes(modifier.statType) ? "profession-skill" :
      modifier.statType === 90 ? "ignored-item-weapon-skill" :
      [126, 128, 131, 134, 136].includes(modifier.statType) ? "opponent-conditional-offense" :
      modifier.statType === 83 ? "physical-damage" : "expertise";
    return { ...modifier, name: item.name, statName: names.get(modifier.statType), kind,
      affectsDeclaredHealingAssignment: kind === "health-regeneration",
      retainedAsCandidate: true };
  });
  const health = rows.filter((row) => row.kind === "health-regeneration");
  assert.equal(health.length, 8);
  const physicalDifferences = rows.filter((row) => row.kind === "physical-damage")
    .flatMap((row) => {
      const actual = items.get(row.id).bonusPhysicalDamage ?? 0;
      return actual === row.value ? [] : [{ id: row.id, name: row.name, statType: row.statType,
        current: row.value, catalog: actual, affectsDeclaredHealingAssignment: false,
        requiresOffensiveCatalogReview: true }];
    });
  assert.deepEqual(physicalDifferences.map((row) => row.id), [227809]);
  assert(items.get(12775).weaponSkills.every((value) => value === 0));
  return {
    schema: "kfc-shaman-item-modifier-scope.v1", sourceBuild: 70532,
    rows, healthRegeneration: health.map((row) => ({ itemId: row.id, name: row.name, healthPerFive: row.value })),
    physicalDifferences, allPreviouslyUnmappedModifiersClassified: true,
    healthRegenerationUnitsVerified: true, serverTickTimingVerified: false,
    timingReferences: ["two-second-ticks-reference", "five-second-ticks-reference"],
    amountScalesWithHealingPower: false, resourceOnly: true,
    scope: "Stationary post-mitigation healing with no offensive casts or autoattacks. All 2017 candidates retained; item weapon-skill bonuses ignored. Offensive conversion/procs, current-missing base channels and shared effects remain separate.",
    currentCatalogFullyVerified: false, fullClassAdmission: false,
    startsNewClassClock: false, numericalQualification: false, publicationAllowed: false,
  };
}

/** Add only the owned flat-item regeneration implementation and Restoration hooks.
 * @param {{evidence:object,actor:string,implementation:string}} input @returns {object}
 */
export function renderShamanFlatItemRegeneration(input) {
  const rules = reviewShamanItemModifierScope(input.evidence);
  const once = (text, before, after) => {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  };
  const values = "var kfcShamanFlatItemHealthPerFive = map[int32]float64{" +
    rules.healthRegeneration.map((row) => row.itemId + ":" + row.healthPerFive).join(",") + "}\n";
  let actor = once(input.actor, "type RestorationShaman struct {",
    "type RestorationShaman struct {\n\tkfcFlatItemRegeneration *kfcShamanFlatItemRegeneration");
  actor = once(actor, "\tresto.registerKFCShamanCastResourceSets()",
    "\tresto.registerKFCShamanCastResourceSets()\n\tresto.registerKFCShamanFlatItemRegeneration()");
  const implementation = once(input.implementation, "// KFC_SHAMAN_FLAT_ITEM_REGENERATION_VALUES", values);
  return { rules, actor, implementation };
}
