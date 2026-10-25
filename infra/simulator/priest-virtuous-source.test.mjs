import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { reviewPriestVirtuousSource, priestVirtuousItemIds } from "./priest-virtuous-source.mjs";
import {
  preparePriestVirtuousCatalog,
  preparePriestVirtuousDrafts,
} from "./priest-virtuous-drafts.mjs";

const bytes = readFileSync(
  new URL("./fixtures/priest-virtuous-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "c4327cd064bd0f5d5aecc39c286639227a8d6d28a99e758c9630e75014802d53",
);
const evidence = JSON.parse(gunzipSync(bytes, { maxOutputLength: 4_000_000 })),
  review = reviewPriestVirtuousSource(evidence);

function corrupt(mutate) {
  const source = globalThis.structuredClone(evidence);
  mutate(source);
  assert.throws(() => reviewPriestVirtuousSource(source));
}

test("exact Virtuous base identities and all current thresholds stay separate from the alternate", () => {
  assert.deepEqual(review.itemIds, [22078, 22079, 22080, 22081, 22082, 22083, 22084, 22085]);
  assert.equal(review.baseSetId, 514);
  assert.equal(review.excludedVariantSetId, 1675);
  assert.deepEqual(review.flatBonuses, {
    resistancesAtTwo: 8,
    spellPowerAtSix: 23,
    bonusArmorAtEight: 200,
  });
  assert.equal(review.modelAdmission, false);
  assert.equal(review.numericalQualification, false);
  assert.equal(review.startsNewClassClock, false);
});

test("the proc has fixed current capacity, duration, cooldown and explicit Priest-family coupling", () => {
  assert.equal(review.shield.amount, 488);
  assert.equal(review.shield.coefficient, 0);
  assert.equal(review.shield.chance, 0.02);
  assert.equal(review.shield.durationMs, 30000);
  assert.equal(review.shield.icdMs, 60000);
  assert.deepEqual(review.shield.procTypeMask, [139944, 0]);
  assert.equal(review.shield.schoolMask, 127);
  assert.deepEqual(
    [review.shield.clientClassSet, review.shield.clientClassMask],
    [6, [1, 0, 0, 0]],
  );
  assert.equal(review.shield.requiresPriestFamilyInteractionAdmission, true);
  assert.equal(review.shield.requiresIncomingEventAdmission, true);
});

test("class quest association does not invent a physical wear restriction or verified delivery", () => {
  assert.equal(review.gameClassMask, 16);
  assert.equal(review.obtainableClass, 5);
  assert.equal(review.rawWearClassMask, -1);
  assert.equal(review.acquisitionRelations.length, 8);
  assert.equal(review.currentServerAcquisitionVerified, false);
  const drafts = preparePriestVirtuousDrafts(evidence);
  assert.equal(drafts.drafts.length, 8);
  for (const draft of drafts.drafts) {
    assert.equal(draft.rawWearClassMask, -1);
    assert.deepEqual(draft.acquisitionClassAllowlist, [5]);
    assert.equal(draft.rewardRelations.length, 2);
    assert.equal(draft.catalogAdmissionAllowed, false);
  }
});

test("current item stats come from client rows while historical data supplies icons", () => {
  const drafts = preparePriestVirtuousDrafts(evidence),
    belt = drafts.drafts.find((draft) => draft.itemId === 22078).statDraft;
  assert.equal(belt.setId, 514);
  assert.equal(belt.ilvl, 65);
  assert.equal(belt.stats[2], 12);
  assert.equal(belt.stats[3], 13);
  assert.equal(belt.stats[4], 12);
  assert.equal(belt.stats[5], 12);
  assert.equal(belt.stats[26], 52);
  const changed = globalThis.structuredClone(evidence);
  changed.historical.forEach((item) => {
    item.stats = Array(44).fill(99999);
  });
  assert.deepEqual(preparePriestVirtuousDrafts(changed), drafts);
});

test("changed thresholds, missing base rows and mixed item identities fail closed", () => {
  corrupt((source) => {
    source.tables.ItemSetSpell.find(
      (row) => row.ItemSetID === 514 && row.Threshold === 4,
    ).Threshold = 5;
  });
  corrupt((source) => {
    source.normalized.items[0].setId = 1675;
  });
  corrupt((source) => {
    source.tables.ItemSparse[0].AllowableClass = 16;
  });
  corrupt((source) => {
    source.normalized.items.pop();
  });
  corrupt((source) => {
    source.tables.ItemXItemEffect.push({ id: 1, ItemID: 22078, ItemEffectID: 1 });
  });
});

test("changed proc amount, scaling, events, family flags or duration require a new source review", () => {
  corrupt((source) => {
    source.tables.SpellEffect.find((row) => row.SpellID === 27779).EffectBasePointsF = 350;
  });
  corrupt((source) => {
    source.tables.SpellEffect.find((row) => row.SpellID === 27779).EffectBonusCoefficient = 1;
  });
  corrupt((source) => {
    source.tables.SpellAuraOptions.find((row) => row.SpellID === 27778).ProcCategoryRecovery = 0;
  });
  corrupt((source) => {
    source.tables.SpellAuraOptions.find((row) => row.SpellID === 27778).ProcTypeMask[0] |= 524288;
  });
  corrupt((source) => {
    source.tables.SpellClassOptions.find((row) => row.SpellID === 27779).SpellClassMask[0] = 0;
  });
  corrupt((source) => {
    source.tables.SpellDuration.find((row) => row.id === 9).Duration = 60000;
  });
});

test("unreviewed acquisition changes cannot become an admitted class domain", () => {
  corrupt((source) => {
    source.acquisition.relations[0].requiredClassMask = 256;
  });
  corrupt((source) => {
    source.classQuestEvidence[0].requiredClasses = 256;
  });
  corrupt((source) => {
    source.acquisition.currentServerAcquisitionVerified = true;
  });
  corrupt((source) => {
    source.acquisition.reviewedDeliveryQuestIds = [source.acquisition.relations[0].questId];
  });
});

test("catalog preparation adds all eight exact pieces and preserves parent data and evidence", () => {
  const parent = { items: [], enchants: [], zones: [], metadata: { purpose: "unit-contract" } },
    before = JSON.stringify([parent, evidence]),
    result = preparePriestVirtuousCatalog(parent, evidence);
  assert.deepEqual(
    result.additions.map((item) => item.id),
    [...priestVirtuousItemIds],
  );
  assert.deepEqual(result.catalog.items, result.additions);
  assert.deepEqual(result.catalog.metadata, parent.metadata);
  assert(
    result.additions.every(
      (item) =>
        item.setId === 514 && item.classAllowlist.length === 1 && item.classAllowlist[0] === 5,
    ),
  );
  assert.equal(result.modelAdmissionAllowed, false);
  assert.equal(result.requiresAllSetEffectsAdmission, true);
  assert.equal(result.requiresShieldFamilyInteractionAdmission, true);
  assert.equal(result.requiresRewardDeliveryReview, true);
  assert.equal(JSON.stringify([parent, evidence]), before);
  assert.throws(
    () => preparePriestVirtuousCatalog(result.catalog, evidence),
    /Refusing to replace/,
  );
});
