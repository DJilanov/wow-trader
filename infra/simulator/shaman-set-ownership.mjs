import assert from "node:assert/strict";
import { legalShamanHealingGear } from "./shaman-healing-equipment.mjs";

/** Prove the current Spiritcaller thresholds unreachable without removing its items.
 * @param {object} shared @param {object} evidence @returns {object}
 */
export function reviewShamanSpiritcallerReachability(shared, evidence) {
  assert.equal(evidence.schema, "kfc-shaman-set-ownership-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.setId, 2111);
  assert.equal(evidence.selectedRowsAreSourceSubsets, true);
  assert.deepEqual(evidence.categories, [
    { id: 708, Name_lang: "Artisan's Tier", Quantity: 1, Flags: 1 },
  ]);
  assert.deepEqual(evidence.candidateIds, [276538, 276539, 276540, 276541]);
  const items = new Map(shared.items.map((row) => [row.id, row])),
    sources = new Map(shared.sources.map((row) => [row.id, row]));
  assert.deepEqual(
    shared.items
      .filter((row) => row.setId === 2111)
      .map((row) => row.id)
      .sort((a, b) => a - b),
    evidence.candidateIds,
  );
  for (const id of evidence.candidateIds) {
    const item = items.get(id),
      source = sources.get(id),
      raw = shared.tables.ItemSparse.filter((row) => row.id === id);
    assert(item && source);
    assert.equal(item.setId, 2111);
    assert.equal(raw.length, 1);
    assert.deepEqual([raw[0].ItemSet, raw[0].LimitCategory], [2111, 708]);
    assert.deepEqual(
      [source.limitCategory, source.limitCategoryQuantity, source.limitCategoryFlags],
      [708, 1, 1],
    );
  }
  assert.equal(evidence.profiles.length, 30);
  assert.equal(new Set(evidence.profiles.map((row) => row.id)).size, 30);
  const pairs = [];
  for (let a = 0; a < 4; a++)
    for (let b = a + 1; b < 4; b++)
      pairs.push([evidence.candidateIds[a], evidence.candidateIds[b]]);
  const withoutCap = new Map(sources);
  for (const id of evidence.candidateIds)
    withoutCap.set(id, { ...sources.get(id), limitCategory: 0 });
  const profiles = [];
  for (const profile of evidence.profiles) {
    assert([1, 2].includes(profile.faction));
    assert.equal(profile.professions.length, 2);
    assert.equal(new Set(profile.professions).size, 2);
    const context = {
      profile: "restoration-shaman",
      playerClass: 7,
      requireCraftAudit: true,
      faction: profile.faction,
      factionName: profile.faction === 1 ? "Alliance" : "Horde",
      professions: profile.professions,
      originalItems: Array(17).fill(undefined),
      currentIds: new Set(),
    };
    assert(
      legalShamanHealingGear(profile.seed, items, sources, context),
      "Original legality seed changed " + profile.id,
    );
    const slots = new Map();
    for (const row of profile.memberSlots)
      for (const id of row.ids) {
        assert(!slots.has(id));
        slots.set(id, row.slot);
      }
    assert.deepEqual(
      [...slots.keys()].sort((a, b) => a - b),
      evidence.candidateIds,
    );
    assert.equal(new Set(slots.values()).size, 4);
    for (const id of evidence.candidateIds) {
      const gear = structuredClone(profile.seed);
      gear.items[slots.get(id)] = { id };
      assert(
        legalShamanHealingGear(gear, items, sources, context),
        "Single crafted piece lost " + id,
      );
    }
    for (const [a, b] of pairs) {
      const gear = structuredClone(profile.seed);
      gear.items[slots.get(a)] = { id: a };
      gear.items[slots.get(b)] = { id: b };
      assert.equal(
        legalShamanHealingGear(gear, items, sources, context),
        false,
        "Shared category failed to reject pair",
      );
      assert(
        legalShamanHealingGear(gear, items, withoutCap, context),
        "Pair rejection has another unexplained cause",
      );
    }
    profiles.push({
      id: profile.id,
      faction: profile.faction,
      professions: [...profile.professions],
      legalSingles: 4,
      rejectedDistinctPairs: 6,
      pairedConstraintRemovalControls: 6,
      maximumSetPieces: 1,
    });
  }
  assert.equal(profiles.filter((row) => row.faction === 1).length, 15);
  assert.equal(profiles.filter((row) => row.faction === 2).length, 15);
  return {
    schema: "kfc-shaman-spiritcaller-reachability-review.v1",
    sourceBuild: 70532,
    setId: 2111,
    candidateIds: [...evidence.candidateIds],
    allCandidateItemsRetained: true,
    category: structuredClone(evidence.categories[0]),
    maximumSetPieces: 1,
    unreachableThresholds: [2, 3, 4, 5],
    legalSingles: 120,
    rejectedDistinctPairs: 180,
    pairedConstraintRemovalControls: 180,
    profiles,
    scope:
      "Actual catalog equipment subject to the reviewed shared one-item category; does not admit forced simulation-only tier bonuses or other acquisition profiles.",
    qualifiesItemStats: false,
    qualifiesGeneralTierMechanics: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
