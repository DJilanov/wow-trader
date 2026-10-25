import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { prepareHunterBeastmasterDrafts } from "./hunter-beastmaster-drafts.mjs";
import {
  hunterBeastmasterItemIds,
  reviewHunterBeastmasterSource,
} from "./hunter-beastmaster-source.mjs";

const evidence = JSON.parse(
  gunzipSync(
    await readFile(new URL("./fixtures/hunter-beastmaster-source.v1.json.gz", import.meta.url)),
  ),
);

test("base Beastmaster uses current 2/4/6/8 bonuses and a ranged-only 4% mana proc", () => {
  const review = reviewHunterBeastmasterSource(evidence);
  assert.deepEqual(review.itemIds, [...hunterBeastmasterItemIds]);
  assert.equal(review.setId, 515);
  assert.equal(review.excludedVariant, 1669);
  assert.deepEqual(review.setBonuses, {
    resistancesAtTwo: 8,
    manaAtFour: 200,
    attackPowerAtSix: 40,
    rangedAttackPowerAtSix: 40,
    bonusArmorAtEight: 200,
  });
  assert.deepEqual(review.proc, {
    spellId: 27785,
    manaSpellId: 27786,
    chance: 0.04,
    rangedWhiteOnly: true,
    cooldownMs: 0,
    usesPpm: false,
    serverCadenceVerified: false,
  });
  assert.equal(review.numericalOptimizationAllowed, false);
});

test("each equip effect retains pet targeting, 3-second refresh and 4-second duration", () => {
  const review = reviewHunterBeastmasterSource(evidence);
  assert.deepEqual(
    review.petEffects.map((row) => [row.itemId, row.kind, row.percent]),
    [
      [22013, "pet-health-percent", 3],
      [22015, "pet-weapon-crit-percent", 2],
      [22060, "pet-base-armor-percent", 10],
      [22061, "pet-all-school-damage-percent", 3],
    ],
  );
  for (const row of review.petEffects) {
    assert.equal(row.refreshMs, 3000);
    assert.equal(row.durationMs, 4000);
    assert.equal(row.targetRangeYards, 100);
    assert.equal(row.runtimeQualified, false);
    assert.equal(row.serverTimingVerified, false);
  }
  assert(review.runtimeRequirements.some((row) => row.includes("without adding spell crit")));
  assert(review.runtimeRequirements.some((row) => row.includes("total-armor")));
});

test("partial reward evidence does not manufacture the four pending quest rewards", () => {
  const review = reviewHunterBeastmasterSource(evidence);
  assert.deepEqual(review.acquisition.reviewedQuestIds, [8952, 9000, 9008, 9017]);
  assert.deepEqual(review.acquisition.pendingQuestIds, [8906, 8914, 8931, 8938]);
  assert.equal(review.acquisition.completeRewardReview, false);
  assert.equal(review.acquisition.currentServerVerified, false);
  assert.equal(review.publicationAllowed, false);
});

test("source changes to proc, pet payloads, periods and duration fail closed", () => {
  const effect = (x, id) => x.tables.SpellEffect.find((row) => row.SpellID === id),
    proc = (x, id) => x.tables.SpellAuraOptions.find((row) => row.SpellID === id),
    mutations = [
      (x) => {
        proc(x, 27785).ProcChance = 5;
      },
      (x) => {
        proc(x, 27785).ProcTypeMask[0] = 68;
      },
      (x) => {
        proc(x, 27785).SpellProcsPerMinuteID = 1;
      },
      (x) => {
        effect(x, 27786).EffectBasePointsF = 100;
      },
      (x) => {
        effect(x, 27042).EffectAura = 57;
      },
      (x) => {
        effect(x, 27208).EffectAura = 101;
      },
      (x) => {
        effect(x, 27205).EffectMiscValue[0] = 1;
      },
      (x) => {
        effect(x, 27205).ImplicitTarget[0] = 1;
      },
      (x) => {
        effect(x, 27043).EffectAuraPeriod = 4000;
      },
      (x) => {
        effect(x, 27038).EffectTriggerSpell = 27205;
      },
      (x) => {
        effect(x, 27206).EffectBonusCoefficient = 0;
      },
      (x) => {
        effect(x, 27039).BonusCoefficientFromAP = 0.1;
      },
      (x) => {
        effect(x, 27039).unreviewedScaling = 1;
      },
      (x) => {
        proc(x, 27043).ProcChance = 100;
      },
      (x) => {
        x.tables.SpellDuration.find((row) => row.id === 35).Duration = 3000;
      },
      (x) => {
        x.tables.SpellRange.find((row) => row.id === 6).RangeMax[0] = 30;
      },
      (x) => {
        x.tables.SpellMisc.find((row) => row.SpellID === 27039).DurationIndex = 21;
      },
      (x) => {
        x.tables.ItemEffect[0].TriggerType = 0;
      },
      (x) => {
        x.tables.ItemXItemEffect[0].ItemEffectID = 102937;
      },
      (x) => {
        x.tables.SpellEffect.push({ ...effect(x, 27039), id: 999999, EffectIndex: 1 });
      },
    ];
  for (const mutate of mutations) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => reviewHunterBeastmasterSource(changed));
  }
});

test("set aliases, duplicated identities and unsupported individual effects are rejected", () => {
  const mutations = [
    (x) => {
      x.normalized.sets.find((row) => row.id === 515).ItemID[0] = 226903;
    },
    (x) => {
      x.normalized.setEffects.find((row) => row.ItemSetID === 515 && row.Threshold === 4).SpellID =
        450577;
    },
    (x) => {
      x.normalized.items[0].setId = 1669;
    },
    (x) => {
      x.normalized.items[0].effectIds.push(99999);
    },
    (x) => {
      x.normalized.items[0].issues.push("unknown-effect");
    },
    (x) => {
      x.normalized.items.push(globalThis.structuredClone(x.normalized.items[0]));
    },
    (x) => {
      x.tables.ItemSparse[0].Bonding = 2;
    },
    (x) => {
      x.normalized.hotfixSha256 = "another-hotfix";
    },
  ];
  for (const mutate of mutations) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => prepareHunterBeastmasterDrafts(changed));
  }
});

test("other-flavor, inferred and choice rewards cannot pass acquisition review", () => {
  const mutations = [
    (x) => {
      x.acquisition.relations[0].rewardIds = [22011];
    },
    (x) => {
      x.acquisition.relations[0].status = "reviewed-forever-reward-rows";
    },
    (x) => {
      x.acquisition.relations[4].url = x.acquisition.relations[4].url.replace(
        "/forever/",
        "/classic/",
      );
    },
    (x) => {
      x.acquisition.relations[4].rewardDelivery = "choose-one";
    },
    (x) => {
      x.acquisition.relations[4].rewardIds.pop();
    },
    (x) => {
      x.acquisition.relations[4].faction = "Horde";
    },
    (x) => {
      x.classQuestEvidence[0].requiredClasses = 1;
    },
    (x) => {
      x.acquisition.relations.pop();
    },
    (x) => {
      x.acquisition.completeRewardReview = true;
    },
  ];
  for (const mutate of mutations) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => reviewHunterBeastmasterSource(changed));
  }
});

test("all eight stat drafts preserve effects and evidence without admitting items", () => {
  const before = globalThis.structuredClone(evidence),
    result = prepareHunterBeastmasterDrafts(evidence);
  assert.deepEqual(evidence, before);
  assert.equal(result.drafts.length, 8);
  assert.equal(
    result.drafts.reduce((n, row) => n + row.individualEffects.length, 0),
    4,
  );
  const belt = result.drafts.find((row) => row.itemId === 22010),
    boots = result.drafts.find((row) => row.itemId === 22061);
  assert.deepEqual([belt.statDraft.stats[1], belt.statDraft.stats[26]], [16, 214]);
  assert.deepEqual([boots.statDraft.stats[1], boots.statDraft.stats[26]], [24, 266]);
  assert.deepEqual(belt.rewardRelations, []);
  assert.equal(boots.rewardRelations.length, 2);
  for (const row of result.drafts) {
    assert.equal(row.catalogAdmissionAllowed, false);
    assert.equal(row.rawWearClassMask, -1);
    assert.equal(row.statDraft.setId, 515);
    assert.equal(row.statDraft.classAllowlist, undefined);
  }
  assert.equal(result.numericalOptimizationAllowed, false);
  assert.equal(result.publicationAllowed, false);
  boots.rewardRelations[0].rewardIds.length = 0;
  assert.deepEqual(
    evidence,
    before,
    "Returned acquisition metadata must not alias source evidence",
  );
});
