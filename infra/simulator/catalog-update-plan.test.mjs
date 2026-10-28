import assert from "node:assert/strict";
import test from "node:test";
import { planSimulatorCatalogUpdate } from "./catalog-update-plan.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

const hash = (value) => simulationHash(value);
function item(id, type, setId = 0) {
  return { id, type, setId, stats: Array(44).fill(0) };
}
function fixture() {
  const before = {
    mechanicsSha256: hash("mechanics"),
    requestContextSha256: hash("full context"),
    eligibilitySha256: hash("eligibility"),
    backend: {
      binarySha256: hash("binary"),
      compiledDatabaseSha256: hash("database"),
      codecSha256: hash("codec"),
      runnerSourceSha256: hash("runner"),
    },
    incumbent: { items: Array.from({ length: 17 }, (_, slot) => ({ id: slot === 0 ? 1 : 0 })) },
    catalog: {
      items: [item(1, 1, 100), item(2, 5, 100), item(3, 1), item(4, 9, 200)],
      enchants: [{ effectId: 7, spellId: 70, type: 1, stats: Array(44).fill(0) }],
      encounters: [],
    },
    inspection: {
      items: { 1: {}, 2: {}, 3: {}, 4: {} },
      sets: {
        100: { effects: [{ threshold: 2, spellId: 500 }] },
        200: { effects: [{ threshold: 2, spellId: 600 }] },
      },
      enchants: {},
    },
  };
  return { before, after: structuredClone(before) };
}
function plan(input) {
  return planSimulatorCatalogUpdate({ profile: "warlock", ...input });
}

test("unchanged inputs schedule no work and never grant numerical or publication admission", () => {
  const input = fixture(),
    before = structuredClone(input),
    result = plan(input);
  assert.equal(result.mode, "no-change");
  assert.deepEqual(result.slots, []);
  assert.deepEqual(result.groups, []);
  assert.equal(result.freshIndependentConfirmationRequired, false);
  assert.equal(result.exactMeasurementLookupPossible, true);
  for (const key of [
    "measurementReuseAuthorized",
    "crossCatalogReuseAllowed",
    "inputSourceAdmissionVerified",
    "publicationAllowed",
    "permanentItemBlacklistAllowed",
    "topFiveOnlyPruningAllowed",
  ])
    assert.equal(result[key], false);
  assert.equal(result.nativeJobs, 0);
  assert.equal(result.browserJobs, 0);
  assert.deepEqual(input, before);
});

test("a new non-set helm reopens its slot, compatible enchants and an old set threshold", () => {
  const input = fixture();
  input.after.catalog.items.push(item(5, 1));
  input.after.inspection.items[5] = {};
  const result = plan(input);
  assert.equal(result.mode, "affected-groups-review-required");
  assert.deepEqual(result.slots, [0]);
  assert.deepEqual(result.itemChanges, [{ id: 5, kind: "added" }]);
  assert.deepEqual(
    result.groups.map((group) => group.id),
    ["slot-0", "enchant-0", "set-100"],
  );
  assert.equal(result.groups.find((group) => group.id === "set-100").retainFullSet, true);
  assert.equal(result.invalidateAllGroupsAfterWinningGearChange, true);
  assert.equal(result.gearedTalentRotationConsumeFeedbackRequired, true);
  assert.equal(result.freshIndependentConfirmationRequired, true);
});

test("rings, trinkets and hands retain both ordered positions instead of isolated-slot challenges", () => {
  for (const [type, expected, pair] of [
    [11, [10, 11], "rings"],
    [12, [12, 13], "trinkets"],
    [13, [14, 15], "hands"],
  ]) {
    const input = fixture();
    input.after.catalog.items.push(item(5, type));
    input.after.inspection.items[5] = {};
    const result = plan(input);
    assert.deepEqual(result.slots, expected);
    assert.deepEqual(result.groups.find((group) => group.id === pair).slots, expected);
    assert.equal(
      result.groups.some((group) => expected.some((slot) => group.id === "slot-" + slot)),
      false,
    );
    assert.equal(
      result.groups.some((group) => group.kind === "enchant"),
      false,
      "An unsupported ring/trinket enchant group was invented",
    );
  }
});

test("a ranged/relic update is reviewed in its actual slot without an invented hand pair", () => {
  const input = fixture();
  input.after.catalog.items.push(item(5, 14));
  input.after.inspection.items[5] = {};
  const result = plan(input);
  assert.deepEqual(result.slots, [16]);
  assert.deepEqual(
    result.groups.map((group) => group.id),
    ["slot-16"],
  );
});

test("unequipped stat and removal changes reopen their groups without permanently blacklisting an old item", () => {
  const stats = fixture();
  stats.after.catalog.items[2].stats[5] = 20;
  assert.deepEqual(plan(stats).slots, [0]);
  assert.equal(plan(stats).mode, "affected-groups-review-required");
  const removal = fixture();
  removal.after.catalog.items = removal.after.catalog.items.filter((row) => row.id !== 3);
  delete removal.after.inspection.items[3];
  assert.deepEqual(plan(removal).itemChanges, [{ id: 3, kind: "removed" }]);
  assert.deepEqual(plan(removal).slots, [0]);
});

test("an equipped item's changed stats invalidate every dependent group", () => {
  const input = fixture();
  input.after.catalog.items[0].stats[5] = 20;
  const result = plan(input);
  assert.equal(result.mode, "full-profile-review-required");
  assert.deepEqual(
    result.slots,
    Array.from({ length: 17 }, (_, index) => index),
  );
  assert(result.fullReviewReasons.includes("incumbent-item-record-changed"));
  assert.deepEqual(
    [...new Set(result.groups.flatMap((group) => group.slots))].sort((a, b) => a - b),
    result.slots,
  );
});

test("set-effect changes are considered even when the item records are unchanged", () => {
  const input = fixture();
  input.after.inspection.sets[200].effects[0].spellId = 601;
  const result = plan(input);
  assert.deepEqual(result.changedSetIds, [200]);
  assert.deepEqual(result.slots, [8]);
  assert.equal(result.groups.find((group) => group.id === "set-200").retainFullSet, true);
  const equipped = fixture();
  equipped.after.inspection.sets[100].effects[0].spellId = 501;
  assert.equal(plan(equipped).mode, "full-profile-review-required");
});

test("new multi-slot enchants retain their entire allowed geometry", () => {
  const input = fixture();
  input.after.catalog.enchants.push({
    effectId: 8,
    spellId: 80,
    type: 9,
    extraTypes: [7, 10],
    stats: Array(44).fill(0),
  });
  const result = plan(input);
  assert.deepEqual(result.slots, [6, 8, 9]);
  assert.deepEqual(
    result.groups.filter((group) => group.kind === "enchant").map((group) => group.slots[0]),
    [6, 8, 9],
  );
});

test("changed enchant inspection payloads and an equipped enchant trigger the required review", () => {
  const input = fixture();
  input.after.inspection.enchants["7:70:1"] = { effects: [700] };
  assert.deepEqual(plan(input).changedInspectionEnchantKeys, ["7:70:1"]);
  assert.deepEqual(plan(input).slots, [0]);
  input.before.incumbent.items[0].enchant = 7;
  input.after.incumbent.items[0].enchant = 7;
  assert(plan(input).fullReviewReasons.includes("incumbent-enchant-record-changed"));
});

test("all mechanics, context, incumbent and runtime changes force a full review", () => {
  for (const change of [
    (input) => {
      input.after.mechanicsSha256 = hash("changed mechanics");
    },
    (input) => {
      input.after.requestContextSha256 = hash("changed buffs or rotation");
    },
    (input) => {
      input.after.eligibilitySha256 = hash("new acquisition evidence");
    },
    (input) => {
      input.after.backend.binarySha256 = hash("changed binary");
    },
    (input) => {
      input.after.incumbent.items[0].id = 3;
    },
  ]) {
    const input = fixture();
    change(input);
    const result = plan(input);
    assert.equal(result.mode, "full-profile-review-required");
    assert.equal(result.slots.length, 17);
    assert.equal(result.measurementReuseAuthorized, false);
  }
});

test("unknown global data and missing item/set/effect geometry fail conservatively", () => {
  for (const change of [
    (input) => {
      input.after.catalog.randomSuffixes = [{ id: 7 }];
    },
    (input) => {
      input.after.inspection.source = { build: "unreviewed" };
    },
    (input) => {
      input.after.catalog.items.push(item(5, 1));
    },
    (input) => {
      input.after.catalog.items.push(item(5, 1, 300));
      input.after.inspection.items[5] = {};
    },
    (input) => {
      input.after.inspection.sets[300] = { effects: [] };
    },
    (input) => {
      input.after.inspection.enchants["unknown"] = {};
    },
    (input) => {
      input.after.inspection.items[999] = {};
    },
  ]) {
    const input = fixture();
    change(input);
    assert.equal(plan(input).mode, "full-profile-review-required");
  }
});

test("unknown or duplicate identities, nonfinite stats and malformed gear are rejected", () => {
  for (const change of [
    (input) => {
      input.after.catalog.items.push(input.after.catalog.items[0]);
    },
    (input) => {
      input.after.catalog.enchants.push(input.after.catalog.enchants[0]);
    },
    (input) => {
      input.after.catalog.items[0].type = 15;
    },
    (input) => {
      input.after.catalog.items[0].stats[0] = NaN;
    },
    (input) => {
      input.after.catalog.items[0].stats.pop();
    },
    (input) => {
      input.after.incumbent.items.pop();
    },
    (input) => {
      input.after.incumbent.items[1].enchant = 7;
    },
    (input) => {
      input.after.incumbent.items[0].id = 999;
    },
    (input) => {
      input.after.incumbent.items[0].unreviewed = true;
    },
    (input) => {
      input.after.backend.codecSha256 = "missing";
    },
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() => plan(input));
  }
});

test("all roles share deterministic planning without carrying old performance scores", () => {
  const input = fixture();
  input.after.catalog.items.push(item(5, 13));
  input.after.inspection.items[5] = {};
  for (const profile of ["warrior", "tank_warrior", "healing-shaman"]) {
    const result = planSimulatorCatalogUpdate({ profile, ...input });
    assert.equal(result.identity, planSimulatorCatalogUpdate({ profile, ...input }).identity);
    assert.equal(Object.hasOwn(result, "dps"), false);
    assert.equal(Object.hasOwn(result, "hps"), false);
    assert.equal(result.topFiveOnlyPruningAllowed, false);
  }
});
