import assert from "node:assert/strict";

/** Render the isolated direct-heal component from the validated basic source.
 * @param {{implementation:string,source:object}} input
 * @returns {string}
 */
export function renderShamanDirectHealing({ implementation, source }) {
  assert.equal(source.schema, "kfc-shaman-basic-healing-source.v1");
  assert.equal(source.ranks.length, 19);
  for (const flag of ["modelAdmission", "numericalQualification", "publicationAllowed"])
    assert.equal(source[flag], false);
  const selected = source.ranks.filter((rank) =>
    ["healing-wave", "lesser-healing-wave"].includes(rank.family),
  );
  assert.equal(selected.length, 16);
  for (const [family, count] of [
    ["healing-wave", 10],
    ["lesser-healing-wave", 6],
  ])
    assert.deepEqual(
      selected.filter((rank) => rank.family === family).map((rank) => rank.rank),
      Array.from({ length: count }, (_, index) => index + 1),
    );
  const marker = "// KFC_SHAMAN_DIRECT_CLIENT_RANKS";
  assert.equal(implementation.split(marker).length, 2, "Missing or duplicate Shaman rank marker");
  const entries = selected.map((rank) => {
    assert.equal(rank.chainTargets, 0);
    assert.equal(rank.trainingVerified, false);
    const fields = {
      ID: rank.id,
      Rank: rank.rank,
      RequiredLevel: rank.requiredLevel,
      BaseLevel: rank.baseLevel,
      MaxLevel: rank.maxLevel,
      Mana: rank.mana,
      CastMs: rank.castMs,
      GCDMs: rank.gcdMs,
      Base: rank.base,
      Variance: rank.variance,
      PointsPerLevel: rank.pointsPerLevel,
      Coefficient: rank.coefficient,
    };
    for (const [key, value] of Object.entries(fields))
      assert(typeof value === "number" && Number.isFinite(value) && value >= 0, key);
    return `{${Object.entries(fields)
      .map(([key, value]) => `${key}:${value}`)
      .join(",")}}`;
  });
  return implementation.replace(
    marker,
    `var kfcShamanDirectRanks = []kfcShamanDirectRank{\n${entries.join(",\n")},\n}`,
  );
}
