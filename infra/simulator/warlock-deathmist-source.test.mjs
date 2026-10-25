import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { currentLevel60Ratings } from "./current-prebis-staging.mjs";
import {
  warlockDeathmistItemIds,
  reviewWarlockDeathmistSource,
} from "./warlock-deathmist-source.mjs";
import { prepareWarlockDeathmistDrafts } from "./warlock-deathmist-drafts.mjs";

const compressed = readFileSync(
    new URL("./fixtures/warlock-deathmist-source.v1.json.gz", import.meta.url),
  ),
  fixture = JSON.parse(gunzipSync(compressed));

test("the captured 70532 base source preserves its exact identity and alternate-only healing and mana effects", () => {
  assert.equal(
    createHash("sha256").update(compressed).digest("hex"),
    "eee39db4f07d629edb5715f239fd1eb29a628a324ce58dd860b62d1ff79c9faa",
  );
  const result = reviewWarlockDeathmistSource(fixture);
  assert.deepEqual(result.itemIds, [...warlockDeathmistItemIds]);
  assert.deepEqual(result.thresholdSpells, [
    [2, 18679],
    [4, 27780],
    [6, 14047],
    [8, 14803],
  ]);
  assert.equal(result.excludedVariantSetId, 1681);
  assert.equal(result.bonuses.spellPowerAndHealing.amount, 23);
  assert.equal(result.bonuses.bonusArmor.amount, 200);
  assert.equal(result.fear.procChancePercent, 2);
  assert.equal(result.fear.internalCooldownMs, 60000);
  assert.equal(result.fear.durationMs, 2000);
  assert.equal(result.alternateOnlyBonuses.mp5.pieces, 3);
  assert.equal(result.alternateOnlyBonuses.healingProc.basePoints, 300);
  assert.equal(result.fear.movementSpeedPercent, -25);
  assert.equal(result.fear.diminishingReturnsVerified, false);
  assert.equal(result.fear.attackerTargetingAndRangeVerified, false);
  assert.equal(result.alternateOnlyBonuses.healingProc.variance, 0.2);
  assert.equal(result.runtimeQualified, false);
  assert.equal(result.publicationAllowed, false);
});

test("all eight stat drafts use current armor, spell power and universal rating conversion", () => {
  const result = prepareWarlockDeathmistDrafts(fixture),
    ratings = currentLevel60Ratings(fixture.ratings),
    mask = result.drafts.find((row) => row.itemId === 22074),
    robe = result.drafts.find((row) => row.itemId === 22075),
    gloves = result.drafts.find((row) => row.itemId === 22077);
  assert.equal(result.drafts.length, 8);
  assert.equal(mask.statDraft.stats[3], 24);
  assert.equal(mask.statDraft.stats[5], 16);
  assert.equal(mask.statDraft.stats[26], 75);
  assert.equal(robe.statDraft.stats[19], 14 / ratings["Crit - Melee"]);
  assert.equal(gloves.statDraft.stats[18], 10 / ratings["Hit - Melee"]);
  for (const row of result.drafts) {
    assert.equal(row.statDraft.setId, 518);
    assert.equal(row.statDraft.armorType, 1);
    assert.deepEqual(row.acquisitionClassAllowlist, [8]);
    assert.equal(row.rewardRelations.length, 2);
    assert.equal(row.rawWearClassMask, -1);
    assert.equal(row.catalogAdmissionAllowed, false);
  }
  assert.equal(result.review.questRelations, 8);
  assert.equal(result.review.itemRewardAssociations, 16);
  assert.equal(result.review.rewardDeliveryPagesVerified, 0);
  assert.equal(result.numericalOptimizationAllowed, false);
});

test("historical stats cannot replace current stats, while a missing historical icon fails", () => {
  const changed = structuredClone(fixture),
    before = prepareWarlockDeathmistDrafts(changed);
  for (const row of changed.historical) row.stats = Array(44).fill(99999);
  assert.deepEqual(prepareWarlockDeathmistDrafts(changed), before);
  delete changed.historical[0].icon;
  assert.throws(() => prepareWarlockDeathmistDrafts(changed), /icon/);
});

test("partial, repeated or same-name alternate membership and changed threshold links fail closed", () => {
  for (const change of [
    (value) => {
      value.normalized.items.pop();
    },
    (value) => {
      value.normalized.items[0].itemId = value.normalized.items[1].itemId;
    },
    (value) => {
      value.normalized.sets[0].ItemID[0] = 226921;
    },
    (value) => {
      value.normalized.sets[1].id = 518;
    },
    (value) => {
      value.tables.ItemSetSpell.find(
        (row) => row.ItemSetID === 518 && row.SpellID === 27780,
      ).Threshold = 6;
    },
    (value) => {
      value.tables.ItemSetSpell[0].ChrSpecID = 1;
    },
  ]) {
    const value = structuredClone(fixture);
    change(value);
    assert.throws(() => reviewWarlockDeathmistSource(value));
  }
});

test("changed proc masks, chance, cooldown, effect payloads, child duration or omitted effects require review", () => {
  for (const change of [
    (value) => {
      value.tables.SpellCategories.find((row) => row.SpellID === 21330).DiminishType = 4;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 21330).EffectBasePointsF = -50;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 450583).Variance = 0;
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 27780).ProcChance = 5;
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 27780).ProcCategoryRecovery = 0;
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 27780).ProcTypeMask[0] = 81920;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 14047).Variance = 1;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 14803).EffectBasePointsF = 100;
    },
    (value) => {
      value.tables.SpellDuration.find((row) => row.id === 39).Duration = 6000;
    },
    (value) => {
      value.tables.SpellRange.find((row) => row.id === 1).RangeMax = [100, 100];
    },
    (value) => {
      value.tables.SpellEffect.pop();
    },
    (value) => {
      value.tables.ItemXItemEffect.push({ ItemID: 22070, ItemEffectID: 1 });
    },
  ]) {
    const value = structuredClone(fixture);
    change(value);
    assert.throws(() => reviewWarlockDeathmistSource(value));
  }
});

test("quest item relations retain faction, class and delivery uncertainty instead of inventing availability", () => {
  for (const change of [
    (value) => {
      value.acquisition.relations.pop();
    },
    (value) => {
      value.acquisition.relations[0].requiredClassMask = 128;
    },
    (value) => {
      value.acquisition.relations[0].faction = "Horde";
    },
    (value) => {
      value.acquisition.relations[0].rewardItemIds = [22077];
    },
    (value) => {
      value.classQuestEvidence[0].requiredRaces = 0;
    },
    (value) => {
      value.acquisition.relations[0].simultaneousDeliveryVerified = true;
    },
    (value) => {
      value.acquisition.currentServerAcquisitionVerified = true;
    },
    (value) => {
      value.acquisition.reviewedDeliveryQuestIds = [8911];
    },
  ]) {
    const value = structuredClone(fixture);
    change(value);
    assert.throws(() => prepareWarlockDeathmistDrafts(value));
  }
});

test("new item effects, unsupported stats, profession gates or inconsistent snapshots cannot become drafts", () => {
  for (const change of [
    (value) => {
      value.normalized.items[0].effectIds = [1];
    },
    (value) => {
      value.normalized.items[0].stats.push({ statType: 999999, value: 1 });
    },
    (value) => {
      value.tables.ItemSparse[0].RequiredSkill = 197;
    },
    (value) => {
      value.normalized.hotfixSha256 = "0".repeat(64);
    },
    (value) => {
      value.historical.pop();
    },
    (value) => {
      value.publicationAllowed = true;
    },
  ]) {
    const value = structuredClone(fixture);
    change(value);
    assert.throws(() => prepareWarlockDeathmistDrafts(value));
  }
});

test("source review and stat preparation preserve all caller inputs", () => {
  const before = JSON.stringify(fixture);
  reviewWarlockDeathmistSource(fixture);
  prepareWarlockDeathmistDrafts(fixture);
  assert.equal(JSON.stringify(fixture), before);
});
