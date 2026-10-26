import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  reviewShamanFiveThundersSource,
  shamanFiveThundersItemIds,
} from "./shaman-five-thunders-source.mjs";

const bytes = readFileSync(
  new URL("./fixtures/shaman-five-thunders-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "2d8c648bbe99a8d5a63a6e704448dcf8ed98c7f65ffb10623ba2e7e74c9ebb5a",
);
const evidence = JSON.parse(gunzipSync(bytes)),
  reviewed = reviewShamanFiveThundersSource(evidence);

test("Five Thunders source separates exact base and alternate membership and thresholds", () => {
  assert.equal(reviewed.baseSetId, 519);
  assert.equal(reviewed.excludedVariantSetId, 1679);
  assert.deepEqual(reviewed.itemIds, [...shamanFiveThundersItemIds]);
  assert.deepEqual(reviewed.baseThresholds, [
    [2, 18679],
    [4, 27774],
    [6, 14047],
    [8, 14803],
  ]);
  assert.equal(reviewed.baseProc.chancePercent, 4);
  assert.equal(reviewed.baseProc.childSpellId, 27775);
  assert.equal(reviewed.alternateProc.chancePercent, 100);
  assert.equal(reviewed.alternateElectrocute.belongsToBase, false);
});

test("identically named variants and accidental base MP5 cannot be substituted", () => {
  for (const change of [
    (input) => {
      input.normalized.sets[0].ItemID[0] = 227033;
    },
    (input) => {
      input.tables.ItemSetSpell.find(
        (row) => row.ItemSetID === 519 && row.Threshold === 4,
      ).SpellID = 450626;
    },
    (input) => {
      input.tables.ItemSetSpell.push({
        ...input.tables.ItemSetSpell[0],
        Threshold: 3,
        SpellID: 18378,
      });
    },
    (input) => {
      input.normalized.items[0].setId = 1679;
    },
  ]) {
    const changed = structuredClone(evidence);
    change(changed);
    assert.throws(() => reviewShamanFiveThundersSource(changed));
  }
});

test("base proc chance, masks, child payload and duration cannot drift", () => {
  for (const change of [
    (input) => {
      input.tables.SpellAuraOptions.find((row) => row.SpellID === 27774).ProcChance = 100;
    },
    (input) => {
      input.tables.SpellAuraOptions.find((row) => row.SpellID === 27774).ProcTypeMask[0] = 81924;
    },
    (input) => {
      input.tables.SpellEffect.find((row) => row.SpellID === 27775).EffectBasePointsF = 95;
    },
    (input) => {
      input.tables.SpellEffect.find(
        (row) => row.SpellID === 14047 && row.EffectIndex === 1,
      ).EffectBonusCoefficient = 0;
    },
    (input) => {
      input.tables.SpellDuration.find((row) => row.id === 1).Duration = 20000;
    },
    (input) => {
      input.tables.SpellEffect.push(structuredClone(input.tables.SpellEffect[0]));
    },
  ]) {
    const changed = structuredClone(evidence);
    change(changed);
    assert.throws(() => reviewShamanFiveThundersSource(changed));
  }
});

test("base spell and item effect additions require new review", () => {
  for (const change of [
    (input) => {
      input.tables.ItemXItemEffect.push({ ItemID: 22095, ItemEffectID: 1 });
    },
    (input) => {
      input.normalized.items[0].effectIds = [1];
    },
    (input) => {
      input.normalized.items[0].issues = ["unsupported"];
    },
    (input) => {
      input.tables.SpellEffect[0].EffectRadiusIndex[0] = 1;
    },
    (input) => {
      input.tables.SpellEffect[0].EffectAuraPeriod = 3000;
    },
  ]) {
    const changed = structuredClone(evidence);
    change(changed);
    assert.throws(() => reviewShamanFiveThundersSource(changed));
  }
});

test("reference quests retain raw class facts separately from unrestricted wear", () => {
  assert.equal(reviewed.rawWearClassMask, -1);
  assert.equal(reviewed.referenceAcquisitionClassMask, 64);
  assert.equal(reviewed.referenceAcquisitionFaction, "Horde");
  assert.deepEqual(reviewed.rewardQuestIds, [8918, 8942, 8957, 9011]);
  for (const change of [
    (input) => {
      input.tables.ItemSparse[0].AllowableClass = 64;
    },
    (input) => {
      input.acquisition.relations[0].requiredClassMask = 2;
    },
    (input) => {
      input.acquisition.relations[0].faction = "Alliance";
    },
    (input) => {
      input.acquisition.relations[0].rewardItemIds = [227033];
    },
    (input) => {
      input.classQuestEvidence[0].requiredRaces = 77;
    },
    (input) => {
      input.acquisition.relations[0].simultaneousDeliveryVerified = true;
    },
  ]) {
    const changed = structuredClone(evidence);
    change(changed);
    assert.throws(() => reviewShamanFiveThundersSource(changed));
  }
});

test("source preparation does not claim acquisition, engine or numerical admission", () => {
  for (const key of [
    "rewardDeliveryVerified",
    "currentServerAcquisitionVerified",
    "runtimeAdmission",
    "catalogAdmission",
    "startsNewClassClock",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(reviewed[key], false);
  assert.equal(reviewed.baseProc.serverTriggerRoutingVerified, false);
  assert.throws(() => reviewShamanFiveThundersSource({ ...evidence, publicationAllowed: true }));
  assert.throws(() =>
    reviewShamanFiveThundersSource({
      ...evidence,
      normalized: { ...evidence.normalized, clientVersion: "other" },
    }),
  );
});

test("review keeps captured evidence immutable and returns owned result arrays", () => {
  const before = structuredClone(evidence),
    result = reviewShamanFiveThundersSource(evidence);
  result.itemIds[0] = 1;
  result.baseThresholds[0][0] = 1;
  assert.deepEqual(evidence, before);
  assert.equal(reviewed.itemIds[0], 22095);
  assert.equal(reviewed.baseThresholds[0][0], 2);
});
