import assert from "node:assert/strict";

/** Render only the explicitly eligible basic ranks into the isolated class component.
 * @param {{implementation:string,source:object,spellPolicy:object}} input @returns {string}
 */
export function renderShamanHealingBaseline({ implementation, source, spellPolicy }) {
  assert.equal(source.schema, "kfc-shaman-basic-healing-source.v1");
  assert.equal(spellPolicy.schema, "kfc-shaman-healing-spell-policy.v1");
  assert.equal(source.sourceBuild, spellPolicy.source.build.buildNumber);
  assert.equal(implementation.split("// KFC_SHAMAN_CLIENT_HEALING_RANKS").length, 2);
  const allowed = new Set(
      spellPolicy.actions
        .filter((entry) => entry.kind === "heal" && entry.status === "conditional-client-candidate")
        .map((entry) => entry.spellId),
    ),
    ranks = source.ranks.filter((entry) => allowed.has(entry.id));
  assert.equal(ranks.length, 18);
  assert(!ranks.some((entry) => entry.id === 25357));
  const values = ranks.map(
    (rank) =>
      `{ID:${rank.id},Family:${JSON.stringify(rank.family)},Rank:${rank.rank},RequiredLevel:${rank.requiredLevel},BaseLevel:${rank.baseLevel},MaxLevel:${rank.maxLevel},Mana:${rank.mana},Base:${rank.base},Variance:${rank.variance},PointsPerLevel:${rank.pointsPerLevel},Coefficient:${rank.coefficient},CastMs:${rank.castMs},GCDMs:${rank.gcdMs},ChainTargets:${rank.chainTargets},ChainAmplitude:${rank.chainAmplitude}}`,
  );
  return implementation.replace(
    "// KFC_SHAMAN_CLIENT_HEALING_RANKS",
    `var kfcShamanHealingRanks = []kfcShamanHealingRank{${values.join(",\n")},\n}`,
  );
}
