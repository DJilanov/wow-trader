import assert from "node:assert/strict";
import { extractShamanHealingActiveSource } from "./shaman-healing-active-source.mjs";

/** Retain the ranked direct/periodic payload and exact source prerequisite.
 * @param {{evidence:object,domain:object,spellPolicy:object}} input @returns {object}
 */
export function extractShamanRiptideSource({ evidence, domain, spellPolicy }) {
  const active = extractShamanHealingActiveSource(evidence);
  assert.equal(domain.schema, "kfc-shaman-healing-talent-domain-source.v1");
  assert.equal(spellPolicy.schema, "kfc-shaman-healing-spell-policy.v1");
  assert.equal(domain.sourceBuild, active.sourceBuild);
  const talent = domain.fields.find((row) => row.field === "riptide"),
    prerequisite = domain.fields.find((row) => row.field === "healingWay");
  assert(talent && prerequisite);
  assert.deepEqual(talent.prerequisiteNodeIds, [prerequisite.nodeId]);
  assert.equal(prerequisite.maximum, 3);
  for (const rank of active.riptide) {
    const policy = spellPolicy.actions.find((row) => row.spellId === rank.id);
    assert(policy && policy.status === "conditional-client-candidate" && policy.kind === "heal");
    assert.equal(policy.requiredLevel, rank.requiredLevel);
    assert.equal(rank.durationMs / rank.tickMs, 5);
    assert.equal(rank.sharedCooldownMs, 6000);
    assert.equal(rank.chainHealBonusPercent, 25);
  }
  return {
    schema: "kfc-shaman-riptide-source.v1",
    sourceBuild: active.sourceBuild,
    ranks: structuredClone(active.riptide),
    prerequisite: { field: "healingWay", rank: 3 },
    chainBonusTiming: "on-heal-reference",
    ownerDeath: "hot-continues-reference",
    hotSnapshotVerified: false,
    hotCriticalRuleVerified: false,
    hotHasteVerified: false,
    chainBonusPropagationVerified: false,
    chainHotConsumptionVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Render all three source ranks with distinct direct and periodic coefficients.
 * @param {{implementation:string,source:object}} input @returns {string}
 */
export function renderShamanRiptide({ implementation, source }) {
  assert.equal(source.schema, "kfc-shaman-riptide-source.v1");
  assert.equal(source.ranks.length, 3);
  assert.equal(implementation.split("// KFC_SHAMAN_RIPTIDE_VALUES").length, 2);
  return implementation.replace(
    "// KFC_SHAMAN_RIPTIDE_VALUES",
    "var kfcShamanRiptideRanks = []kfcShamanRiptideRank{" +
      source.ranks
        .map(
          (rank) =>
            `{ID:${rank.id},Rank:${rank.rank},RequiredLevel:${rank.requiredLevel},BaseLevel:${rank.baseLevel},MaxLevel:${rank.maxLevel},Mana:${rank.mana},DirectBase:${rank.direct.base},DirectGrowth:${rank.direct.pointsPerLevel},DirectCoefficient:${rank.direct.coefficient},DirectVariance:${rank.direct.variance},PeriodicBase:${rank.periodic.base},PeriodicGrowth:${rank.periodic.pointsPerLevel},PeriodicCoefficient:${rank.periodic.coefficient},GCDMs:${rank.gcdMs},TickMs:${rank.tickMs},DurationMs:${rank.durationMs},CooldownMs:${rank.sharedCooldownMs},ChainBonusPercent:${rank.chainHealBonusPercent}}`,
        )
        .join(",\n") +
      ",\n}",
  );
}

/** Extend only the derived class and apply an owned Chain Heal multiplier once per recipient.
 * @param {{baseline:string,actives:string}} input @returns {object}
 */
export function integrateShamanRiptide({ baseline, actives }) {
  function once(source, before, after) {
    assert.equal(source.split(before).length, 2, "Unknown Riptide integration boundary");
    return source.replace(before, after);
  }
  baseline = once(
    baseline,
    "\tkfcActives *kfcShamanResourceActives",
    "\tkfcActives *kfcShamanResourceActives\n\tkfcRiptide *kfcShamanRiptideController",
  );
  baseline = once(
    baseline,
    "resto.resetKFCShamanWaterTotems()",
    "resto.resetKFCShamanWaterTotems(); resto.resetKFCShamanRiptide()",
  );
  baseline = once(
    baseline,
    "\tresto.registerKFCShamanResourceActives()",
    "\tresto.registerKFCShamanRiptide()\n\tresto.registerKFCShamanResourceActives()",
  );
  baseline = once(
    baseline,
    "\t\t\t\tused := map[int32]bool{}",
    "\t\t\t\triptideBonus, riptideAll := resto.prepareKFCRiptideChain(sim, target)\n\t\t\t\tused := map[int32]bool{}",
  );
  baseline = once(
    baseline,
    "\t\t\t\t\tresult.Damage *= scale\n\t\t\t\t\tresult.Threat *= scale",
    "\t\t\t\t\thealingScale := scale\n\t\t\t\t\tif hop == 0 || riptideAll { healingScale *= riptideBonus }\n\t\t\t\t\tresult.Damage *= healingScale\n\t\t\t\t\tresult.Threat *= healingScale",
  );
  actives = once(
    actives,
    '(field.Name() == "water_shield" || field.Name() == "natures_swiftness")',
    '(field.Name() == "water_shield" || field.Name() == "natures_swiftness" || field.Name() == "riptide")',
  );
  return { baseline, actives };
}
