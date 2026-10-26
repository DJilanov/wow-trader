import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  collectShamanHealingEquipment,
  legalShamanHealingGear,
} from "./shaman-healing-equipment.mjs";
import { reviewShamanSetReachability } from "./shaman-set-reachability.mjs";

const fixture = (name, digest) => {
  const bytes = readFileSync(new URL(`fixtures/${name}`, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), digest);
  return JSON.parse(gunzipSync(bytes));
};
const shared = fixture(
  "shaman-shared-equipment-source.v1.json.gz",
  "bbdfa1fa0b846f0b46ffe418a1ca1cdbe99194ad9b7767a3bddf7685f9ac82bf",
);
const ownership = fixture(
  "shaman-set-ownership-source.v1.json.gz",
  "3fc38e0ac6e8201e5f6fcd237302190aaaba870273ff38674024f24ed5ecd62d",
);
function contextFor(profile) {
  return {
    profile: "restoration-shaman",
    playerClass: 7,
    requireCraftAudit: true,
    faction: profile.faction,
    factionName: profile.faction === 1 ? "Alliance" : "Horde",
    professions: profile.professions,
    originalItems: Array(17).fill(undefined),
    currentIds: new Set(),
  };
}
function domainFor(source) {
  const items = new Map(source.items.map((row) => [row.id, row]));
  const sources = new Map(source.sources.map((row) => [row.id, row]));
  return {
    schema: "kfc-shaman-healing-equipment-domain.v1",
    statPruning: false,
    qualityPruning: false,
    weaponStyleLocked: false,
    profiles: ownership.profiles.map((profile) => ({
      id: profile.id,
      faction: profile.faction,
      professions: [...profile.professions],
      seed: structuredClone(profile.seed),
      slots: collectShamanHealingEquipment(items, sources, contextFor(profile)).slots,
    })),
  };
}
const domain = domainFor(shared);
const reviewed = reviewShamanSetReachability(shared, domain);

test("all 990 set/profile maximums have actual complete legal witnesses and retain every candidate", () => {
  assert.equal(reviewed.candidateCount, 2017);
  assert.equal(reviewed.setCount, 33);
  assert.equal(reviewed.profileCount, 30);
  assert.equal(reviewed.setProfileCases, 990);
  assert.equal(reviewed.allCandidateItemsRetained, true);
  const items = new Map(shared.items.map((row) => [row.id, row]));
  const sources = new Map(shared.sources.map((row) => [row.id, row]));
  for (const profile of reviewed.profiles)
    for (const set of profile.sets) {
      assert(legalShamanHealingGear(set.witness, items, sources, contextFor(profile)));
      assert.equal(
        set.witness.items.filter((spec) => items.get(spec.id)?.setId === set.setId).length,
        set.maximumSetPieces,
      );
      if ([65, 2111].includes(set.setId)) {
        assert.equal(set.maximumSetPieces, 1);
        assert(set.thresholds.every((row) => !row.reachable));
      }
      if (set.setId === 81) assert.equal(set.maximumSetPieces, 5);
      if ([181, 182, 183, 184, 185, 186, 187].includes(set.setId))
        assert.equal(set.maximumSetPieces, 8);
    }
  assert.equal(reviewed.qualifiesSetMechanics, false);
  assert.equal(reviewed.startsNewClassClock, false);
  assert.equal(reviewed.numericalQualification, false);
  assert.equal(reviewed.publicationAllowed, false);
});

test("faction-only set bonuses remain reachable in their eligible profiles", () => {
  for (const profile of reviewed.profiles)
    for (const set of profile.sets) {
      if ([469, 471, 472, 473].includes(set.setId))
        assert.equal(set.maximumSetPieces, profile.faction === 1 ? 3 : 0);
      if ([483, 484, 485, 486, 488].includes(set.setId))
        assert.equal(set.maximumSetPieces, profile.faction === 2 ? 3 : 0);
    }
});

test("omitted members, profiles or current membership cannot fabricate an unreachable threshold", () => {
  for (const mutate of [
    (data) => data.profiles.pop(),
    (data) => (data.profiles[1] = structuredClone(data.profiles[0])),
    (data) => data.profiles[0].slots[14].pop(),
  ]) {
    const changed = structuredClone(domain);
    mutate(changed);
    assert.throws(() => reviewShamanSetReachability(shared, changed));
  }
  const changed = structuredClone(shared);
  changed.tables.ItemSparse.find((row) => row.id === 276538).ItemSet = 0;
  assert.throws(() => reviewShamanSetReachability(changed, domain));
  const conditional = structuredClone(shared);
  conditional.tables.ItemSet.find((row) => row.id === 1).RequiredSkill = 165;
  assert.throws(() => reviewShamanSetReachability(conditional, domain));
});

test("relaxing only actual ring uniqueness or shared craft ownership changes the proved maxima", () => {
  const changed = structuredClone(shared);
  changed.items.find((row) => row.id === 13392).unique = false;
  for (const id of [276538, 276539, 276540, 276541])
    changed.sources.find((row) => row.id === id).limitCategory = 0;
  const probe = reviewShamanSetReachability(changed, domainFor(changed));
  for (const profile of probe.profiles) {
    assert.equal(profile.sets.find((row) => row.setId === 81).maximumSetPieces, 6);
    assert.equal(profile.sets.find((row) => row.setId === 2111).maximumSetPieces, 4);
  }
  for (const profile of reviewed.profiles) {
    assert.equal(profile.sets.find((row) => row.setId === 81).maximumSetPieces, 5);
    assert.equal(profile.sets.find((row) => row.setId === 2111).maximumSetPieces, 1);
  }
});

test("review results own their witnesses and never mutate source or domain data", () => {
  const before = structuredClone({ shared, domain });
  const output = reviewShamanSetReachability(shared, domain);
  output.profiles[0].sets[0].witness.items[0].id = 0;
  output.profiles[0].sets[0].memberSlots[0].ids.length = 0;
  output.profiles[0].professions.pop();
  assert.deepEqual({ shared, domain }, before);
});
