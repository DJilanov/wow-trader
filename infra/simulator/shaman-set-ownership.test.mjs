import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { reviewShamanSpiritcallerReachability } from "./shaman-set-ownership.mjs";

const read = (name) => readFileSync(new URL("fixtures/" + name, import.meta.url));
const bytes = read("shaman-set-ownership-source.v1.json.gz");
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "3fc38e0ac6e8201e5f6fcd237302190aaaba870273ff38674024f24ed5ecd62d",
);
const evidence = JSON.parse(gunzipSync(bytes)),
  shared = JSON.parse(gunzipSync(read("shaman-shared-equipment-source.v1.json.gz")));

test("all 30 profiles retain four legal singles but reject all distinct Spiritcaller pairs", () => {
  const result = reviewShamanSpiritcallerReachability(shared, evidence);
  assert.equal(result.legalSingles, 120);
  assert.equal(result.rejectedDistinctPairs, 180);
  assert.equal(result.pairedConstraintRemovalControls, 180);
  assert.equal(result.maximumSetPieces, 1);
  assert.deepEqual(result.unreachableThresholds, [2, 3, 4, 5]);
  assert.equal(result.allCandidateItemsRetained, true);
  assert.equal(result.qualifiesGeneralTierMechanics, false);
  assert.equal(result.publicationAllowed, false);
});

test("category drift or omitted members cannot turn an unverified threshold into an inactive effect", () => {
  for (const mutate of [
    (data) => {
      data.categories[0].Quantity = 2;
    },
    (data) => {
      data.categories[0].Flags = 0;
    },
    (data) => data.candidateIds.pop(),
    (data) => data.profiles.pop(),
    (data) => data.profiles[0].memberSlots.pop(),
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => reviewShamanSpiritcallerReachability(shared, changed));
  }
  const changed = structuredClone(shared);
  changed.sources.find((row) => row.id === 276538).limitCategory = 0;
  assert.throws(() => reviewShamanSpiritcallerReachability(changed, evidence));
});

test("the proof preserves actual source, profile seeds and independent output ownership", () => {
  const before = structuredClone({ shared, evidence }),
    result = reviewShamanSpiritcallerReachability(shared, evidence);
  result.candidateIds.pop();
  result.category.Quantity = 999;
  result.profiles[0].professions.pop();
  assert.deepEqual({ shared, evidence }, before);
});
