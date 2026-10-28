import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  priestVirtuousModelReference,
  renderPriestVirtuousModel,
} from "./priest-virtuous-model.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function fixture(name, expected) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  if (expected) assert.equal(sha(bytes), expected);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 4_000_000 }));
}
const evidence = fixture(
  "priest-virtuous-source.v1.json.gz",
  "c4327cd064bd0f5d5aecc39c286639227a8d6d28a99e758c9630e75014802d53",
);
const healingEvidence = fixture(
  "priest-client-healing-source.v1.json.gz",
  "e4ed880f99c62ca8de42ee1f20e22800541df6849d90e56b15811b4d0e3940ab",
);
const parent = fixture(
  "priest-virtuous-dispatch-parent.v1.json.gz",
  "e63714a6a08bb7173575425f6ae55b8b746803dc5e0d93af458a548cd2337606",
);
assert.equal(sha(parent.itemSets), parent.source.byteSha256);
const familyImplementation = readFileSync(
  new URL("./priest-virtuous-family.go", import.meta.url),
  "utf8",
);

test("joins exact client set metadata to actual Priest family modifiers", () => {
  const before = structuredClone({ evidence, healingEvidence });
  const reference = priestVirtuousModelReference(evidence, healingEvidence);
  assert.deepEqual(reference.shieldClassMask, [1, 0, 0, 0]);
  assert.equal(reference.shieldClassSet, 6);
  assert.deepEqual(reference.modifiers[0].values, [0, 7, 14, 20]);
  assert.equal(
    reference.modifiers.some((row) => ["TwinDisciplines", "SpiritualHealing"].includes(row.talent)),
    false,
  );
  assert.equal(reference.serverMechanicsVerified, false);
  assert.equal(reference.serverAcquisitionVerified, false);
  assert.equal(reference.numericalOptimizationAllowed, false);
  assert.equal(reference.publicationAllowed, false);
  assert.deepEqual(reference.acquisitionQuestIds, [8909, 8916, 8934, 8940, 8955, 9003, 9009, 9019]);
  assert.deepEqual({ evidence, healingEvidence }, before);
});
test("integrates exact base-ID dispatch and preserves all unrelated source bytes", () => {
  const result = renderPriestVirtuousModel({
    itemSets: parent.itemSets,
    familyImplementation,
    evidence,
    healingEvidence,
  });
  assert.equal(result.itemSets.split("character.kfcForeverVirtuousBonuses()").length, 2);
  assert(result.itemSets.includes("item.SetID == kfcVirtuousSetID"));
  const restored = result.itemSets
    .replace(
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcForeverVirtuousBonuses()...)",
      "",
    )
    .replace(
      "(overridesForeverEquipmentSet(item.SetID) || item.SetID == kfcVirtuousSetID)",
      "overridesForeverEquipmentSet(item.SetID)",
    );
  assert.equal(restored, parent.itemSets);
  assert(result.familyImplementation.includes("kfcClientHealingSpells[27779]"));
  assert(result.familyImplementation.includes('Family:"virtuous-shield",Mask:[4]uint32{1,0,0,0}'));
  assert(!result.familyImplementation.includes("KFC_VIRTUOUS_FAMILY_METADATA"));
});
test("rejects mismatched snapshots and newly matching talent modifiers", () => {
  const changed = structuredClone(healingEvidence);
  changed.source.hotfixSha256 = "0".repeat(64);
  assert.throws(() => priestVirtuousModelReference(evidence, changed), /hotfixes/);
  const extra = structuredClone(healingEvidence);
  extra.rawTables.SpellEffect.find(
    (row) => row.SpellID === 14898 && row.EffectIndex === 0,
  ).EffectSpellClassMask[0] |= 1;
  assert.throws(() => priestVirtuousModelReference(evidence, extra));
  const shield = structuredClone(evidence);
  shield.tables.SpellClassOptions.find((row) => row.SpellID === 27779).SpellClassMask[0] = 2;
  assert.throws(() => priestVirtuousModelReference(shield, healingEvidence));
});
test("rejects drifted or duplicate compiler integration points", () => {
  for (const itemSets of ["package core", parent.itemSets + "\n" + parent.itemSets])
    assert.throws(() =>
      renderPriestVirtuousModel({ itemSets, familyImplementation, evidence, healingEvidence }),
    );
  assert.throws(() =>
    renderPriestVirtuousModel({
      itemSets: parent.itemSets,
      familyImplementation: "package priest",
      evidence,
      healingEvidence,
    }),
  );
});
