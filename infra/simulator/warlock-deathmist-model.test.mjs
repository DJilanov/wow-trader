import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  renderWarlockDeathmistModel,
  warlockDeathmistModelReference,
} from "./warlock-deathmist-model.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function fixture(name, expected) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(sha(bytes), expected);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 4_000_000 }));
}
const evidence = fixture(
  "warlock-deathmist-source.v1.json.gz",
  "eee39db4f07d629edb5715f239fd1eb29a628a324ce58dd860b62d1ff79c9faa",
);
const parent = fixture(
  "warlock-deathmist-dispatch-parent.v1.json.gz",
  "b583a46fd1baf8a6ec9c6b9fa7979ab32d76ce858235ba59a79a21835cdc032a",
);
assert.equal(sha(parent.itemSets), parent.source.byteSha256);
const implementation = readFileSync(
  new URL("./warlock-deathmist-model.go", import.meta.url),
  "utf8",
);
const targetPolicy = "raid-boss-fear-immune-reference";

test("requires an explicit raid-boss policy and preserves the source's unverified fear mechanics", () => {
  const before = structuredClone(evidence);
  for (const policy of [undefined, "", "stun", "verified-immune"]) {
    assert.throws(() => warlockDeathmistModelReference(evidence, policy), /Explicit target policy/);
  }
  const reference = warlockDeathmistModelReference(evidence, targetPolicy);
  assert.equal(reference.baseSetId, 518);
  assert.equal(reference.excludedVariantSetId, 1681);
  assert.equal(reference.fear.childSpellId, 21330);
  assert.equal(reference.fear.durationMs, 2000);
  assert.equal(reference.fear.movementSpeedPercent, -25);
  assert.equal(reference.fear.immunityBehaviorVerified, false);
  assert.equal(reference.fearableTargetsSupported, false);
  assert.equal(reference.serverMechanicsVerified, false);
  assert.equal(reference.serverAcquisitionVerified, false);
  assert.equal(reference.numericalOptimizationAllowed, false);
  assert.equal(reference.publicationAllowed, false);
  assert.equal(reference.acquisitionQuestIds.length, 8);
  assert.deepEqual(evidence, before);
});

test("integrates only base-ID dispatch and exactly eight current-stat Warlock rewards", () => {
  const result = renderWarlockDeathmistModel({
    itemSets: parent.itemSets,
    implementation,
    evidence,
    targetPolicy,
  });
  assert.equal(result.itemSets.split("character.kfcForeverDeathmistBonuses()").length, 2);
  const restored = result.itemSets
    .replace(
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcForeverDeathmistBonuses()...)",
      "",
    )
    .replace(
      "(overridesForeverEquipmentSet(item.SetID) || item.SetID == kfcDeathmistSetID)",
      "overridesForeverEquipmentSet(item.SetID)",
    );
  assert.equal(restored, parent.itemSets);
  assert(!result.implementation.includes("KFC_DEATHMIST_CLIENT_CONSTANTS"));
  assert(result.implementation.includes("kfcDeathmistSetID = 518"));
  assert(result.implementation.includes("kfcDeathmistProcChance = 0.02"));
  assert(result.implementation.includes("kfcDeathmistICDMs = 60000"));
  assert.deepEqual(
    result.items.map((row) => row.id),
    Array.from({ length: 8 }, (_, index) => 22070 + index),
  );
  for (const item of result.items) {
    assert.equal(item.setId, 518);
    assert.deepEqual(item.classAllowlist, [8]);
    assert.equal(item.stats.length, 44);
    assert(!Object.hasOwn(item, "rewardRelations"));
  }
});

test("rejects source drift and missing or ambiguous compiler integration points", () => {
  for (const itemSets of ["package core", parent.itemSets + "\n" + parent.itemSets]) {
    assert.throws(() =>
      renderWarlockDeathmistModel({ itemSets, implementation, evidence, targetPolicy }),
    );
  }
  for (const source of ["package core", implementation + "\n" + implementation]) {
    assert.throws(() =>
      renderWarlockDeathmistModel({
        itemSets: parent.itemSets,
        implementation: source,
        evidence,
        targetPolicy,
      }),
    );
  }
  const changed = structuredClone(evidence);
  changed.tables.SpellAuraOptions.find((row) => row.SpellID === 27780).ProcChance = 5;
  assert.throws(() => warlockDeathmistModelReference(changed, targetPolicy));
});
