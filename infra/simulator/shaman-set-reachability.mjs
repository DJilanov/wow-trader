import assert from "node:assert/strict";
import { legalPrebisGear } from "./prebis-pool.mjs";
import {
  collectShamanHealingEquipment,
  legalShamanHealingGear,
} from "./shaman-healing-equipment.mjs";

const professions = [1, 2, 3, 4, 8, 11];

function contextFor(profile) {
  return {
    profile: "restoration-shaman",
    playerClass: 7,
    requireCraftAudit: true,
    faction: profile.faction,
    factionName: profile.faction === 1 ? "Alliance" : "Horde",
    professions: [...profile.professions],
    originalItems: Array(17).fill(undefined),
    currentIds: new Set(),
  };
}

function relaxedMemberGearLegal(gear, items, sources, context) {
  const main = items.get(gear.items[14].id);
  if (main?.handType === 4 && gear.items[15].id) return false;
  // Empty nonmember slots relax completeness only. The same acquisition and
  // ownership validator still checks every selected set piece.
  return legalPrebisGear(gear, items, sources, {
    ...context,
    originalItems: gear.items.map((spec) => items.get(spec.id)),
  });
}

function completeWitness(members, profile, items, sources, context) {
  const gear = structuredClone(profile.seed);
  for (const [slot, spec] of members.items.entries())
    if (spec.id) gear.items[slot] = { id: spec.id };
  const main = items.get(gear.items[14].id);
  if (main?.handType === 4 && !members.items[15].id) gear.items[15] = { id: 0 };
  if (legalShamanHealingGear(gear, items, sources, context)) return gear;

  // A chosen off-hand can need a different nonmember main hand than the seed's
  // two-hander. This creates a real full-loadout witness, never a relaxed claim.
  if (!members.items[14].id && members.items[15].id)
    for (const id of profile.slots[14]) {
      if (items.get(id).handType === 4) continue;
      gear.items[14] = { id };
      if (legalShamanHealingGear(gear, items, sources, context)) return gear;
    }
  return undefined;
}

function maximumForSet(setId, profile, items, sources, context) {
  const options = profile.slots
    .map((ids, slot) => ({ slot, ids: ids.filter((id) => items.get(id).setId === setId) }))
    .filter((row) => row.ids.length);
  const members = { items: Array.from({ length: 17 }, () => ({ id: 0 })) };
  let maximum = -1;
  let witness;
  let visitedNodes = 0;
  function visit(index, count) {
    visitedNodes++;
    const remainingMaximum = count + options.length - index;
    if (remainingMaximum < maximum || (remainingMaximum === maximum && witness)) return;
    if (!relaxedMemberGearLegal(members, items, sources, context)) return;
    if (index === options.length) {
      if (count > maximum) {
        maximum = count;
        witness = undefined;
      }
      if (!witness) witness = completeWitness(members, profile, items, sources, context);
      return;
    }
    const { slot, ids } = options[index];
    for (const id of ids) {
      members.items[slot] = { id };
      visit(index + 1, count + 1);
    }
    members.items[slot] = { id: 0 };
    visit(index + 1, count);
  }
  visit(0, 0);
  assert(maximum >= 0);
  assert(witness, `No complete loadout proves the relaxed maximum: ${profile.id}/${setId}`);
  assert(legalShamanHealingGear(witness, items, sources, context));
  assert.equal(
    witness.items.filter((spec) => items.get(spec.id)?.setId === setId).length,
    maximum,
    "Seed filler must not silently add another member",
  );
  return { maximum, witness, memberSlots: options, visitedNodes };
}

/** Prove set thresholds against the complete, unpruned healer equipment domain.
 * The relaxed search proves the upper bound; a legal full loadout attains it.
 * @param {object} shared @param {object} domain @returns {object}
 */
export function reviewShamanSetReachability(shared, domain) {
  assert.equal(shared.schema, "kfc-shaman-shared-equipment-source.v1");
  assert.equal(shared.source.build.buildNumber, 70532);
  assert.equal(shared.selectedRowsAreSourceSubsets, true);
  assert.equal(domain.schema, "kfc-shaman-healing-equipment-domain.v1");
  assert.equal(domain.statPruning, false);
  assert.equal(domain.qualityPruning, false);
  assert.equal(domain.weaponStyleLocked, false);
  assert.equal(domain.profiles.length, 30);
  const expectedProfiles = [];
  for (const faction of [1, 2])
    for (const [index, first] of professions.entries())
      for (const second of professions.slice(index + 1))
        expectedProfiles.push(`${faction}-${first}-${second}`);
  assert.deepEqual(domain.profiles.map((row) => row.id).sort(), expectedProfiles.sort());

  const items = new Map(shared.items.map((row) => [row.id, row]));
  const sources = new Map(shared.sources.map((row) => [row.id, row]));
  const sets = new Map(shared.tables.ItemSet.map((row) => [row.id, row]));
  const rawItems = new Map(shared.tables.ItemSparse.map((row) => [row.id, row]));
  assert.equal(items.size, shared.items.length);
  assert.equal(sources.size, shared.sources.length);
  assert.equal(sets.size, shared.tables.ItemSet.length);
  assert.equal(rawItems.size, shared.tables.ItemSparse.length);
  assert.deepEqual(
    [...items.keys()].sort((a, b) => a - b),
    shared.candidateIds,
  );
  assert.deepEqual(
    [...new Set(shared.items.map((row) => row.setId).filter(Boolean))].sort((a, b) => a - b),
    shared.setIds,
  );
  for (const item of shared.items) {
    assert(sources.has(item.id));
    const raw = rawItems.get(item.id);
    if (raw) assert.equal(item.setId ?? 0, raw.ItemSet, `Current set membership ${item.id}`);
  }
  const profiles = [];
  for (const profile of domain.profiles) {
    assert.equal(profile.id, `${profile.faction}-${profile.professions.join("-")}`);
    const context = contextFor(profile);
    const actualPool = collectShamanHealingEquipment(items, sources, context);
    assert.deepEqual(profile.slots, actualPool.slots, `Candidate omission in ${profile.id}`);
    assert(legalShamanHealingGear(profile.seed, items, sources, context));
    const results = shared.setIds.map((setId) => {
      const source = sets.get(setId);
      assert(source, `Missing captured set ${setId}`);
      assert.equal(source.RequiredSkill, 0, "Set activation skill needs a new review");
      assert.equal(source.RequiredSkillRank, 0);
      assert.equal(source.SetFlags, 0, "Set activation flags need a new review");
      const result = maximumForSet(setId, profile, items, sources, context);
      const thresholds = shared.tables.ItemSetSpell.filter((row) => row.ItemSetID === setId)
        .map((row) => {
          assert.equal(row.ChrSpecID, 0, "Specialization-gated threshold needs a review");
          assert.equal(row.TraitSubTreeID, 0, "Talent-gated threshold needs a review");
          return { id: row.id, pieces: row.Threshold, spellId: row.SpellID };
        })
        .sort((a, b) => a.pieces - b.pieces || a.id - b.id);
      for (const threshold of thresholds)
        assert(Number.isSafeInteger(threshold.pieces) && threshold.pieces > 0);
      return {
        setId,
        name: source.Name_lang,
        maximumSetPieces: result.maximum,
        maximumProvenByLegalFullLoadout: true,
        witness: result.witness,
        memberSlots: result.memberSlots,
        visitedNodes: result.visitedNodes,
        thresholds: thresholds.map((row) => ({
          ...row,
          reachable: row.pieces <= result.maximum,
        })),
      };
    });
    profiles.push({
      id: profile.id,
      faction: profile.faction,
      professions: [...profile.professions],
      sets: results,
    });
  }
  return {
    schema: "kfc-shaman-set-reachability-review.v1",
    sourceBuild: 70532,
    candidateCount: items.size,
    setCount: sets.size,
    profileCount: profiles.length,
    setProfileCases: profiles.reduce((sum, row) => sum + row.sets.length, 0),
    allCandidateItemsRetained: true,
    maximumsProvenByRelaxationAndLegalFullLoadouts: true,
    profiles,
    scope:
      "Exact modeled set membership and admitted pre-raid ownership/profile rules. Historical source status is retained. No forced tier flags, dual-wield talent scope, server availability or item-effect qualification is inferred.",
    qualifiesItemStats: false,
    qualifiesSetMechanics: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
