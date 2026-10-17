import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { accessoryFeedbackSettings } from "../infra/simulator/accessory-feedback.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import {
  createAccessoryChallenges,
  shortlistAccessoryChallenges,
  accessoryChallengeVerdict,
  accessoryConfirmationResults,
} from "../infra/simulator/accessory-challengers.mjs";
import {
  eligiblePrebis,
  legalPrebisGear,
  mergeClassicPrebis,
  prebisSlotTypes,
  statisticallyBetter,
  prebisSources,
  prebisContext,
  prebisSetSubsets,
} from "../infra/simulator/prebis-pool.mjs";

const reference = JSON.parse(
  await readFile(
    new URL("../infra/simulator/classic-prebis-reference.json", import.meta.url),
    "utf8",
  ),
);
const fixture = (id, type, extra = {}) => ({
  id,
  name: `Item ${id}`,
  type,
  stats: Array(44).fill(0),
  ...extra,
});
const source = (extra = {}) => ({
  requiredLevel: 60,
  sources: [{ kind: "dungeon", zoneId: 1584 }],
  ...extra,
});
const context = {
  profile: "warrior",
  playerClass: 9,
  faction: 2,
  factionName: "Horde",
  professions: [4],
  currentIds: new Set(),
  originalItems: Array(17).fill(null),
};

function accessoryFixture() {
  const items = prebisSlotTypes.map((type, slot) =>
    fixture(
      1000 + slot,
      type,
      slot === 14 ? { weaponType: 9, handType: 4 } : slot === 16 ? { rangedWeaponType: 1 } : {},
    ),
  );
  const baseline = {
    profile: "warrior",
    variant: "arms",
    playerClass: 9,
    settings: {
      settings: { faction: "Alliance" },
      player: {
        race: "RaceHuman",
        profession1: "Engineering",
        profession2: "Blacksmithing",
        equipment: { items: items.map((item, slot) => (slot === 15 ? {} : { id: item.id })) },
      },
    },
  };
  const sources = new Map(items.map((item) => [item.id, source()]));
  return { baseline, db: { items }, sources };
}

test("confirmed accessory baseline changes only legal accessories and rejects stale or fabricated gains", () => {
  const { baseline, db, sources } = accessoryFixture();
  baseline.dbSha256 = simulationHash(db);
  const bank = createAccessoryChallenges(baseline, db, sources, "trinkets");
  const challenge = bank.candidates.find((entry) => entry.itemIds.join() === "1013,1013");
  assert(challenge);
  const review = {
    status: "closed-loop-verified",
    baselineSha256: simulationHash(baseline),
    nativeBinarySha256: "a".repeat(64),
    validationSeedRanges: [{ seed: 2000000, iterations: 100000 }],
  };
  const comparisons = [4000000, 4100000].map((seed) => ({
    seed,
    baseline: { dps: 100, stdev: 1, iterations: 100000 },
    candidate: { dps: 110, stdev: 1, iterations: 100000 },
  }));
  const best = { challenge, ...accessoryChallengeVerdict(comparisons) };
  const audit = {
    schema: "kfc-accessory-challenger-audit.v1",
    status: "challenger-requires-feedback",
    kind: "trinkets",
    profile: "warrior",
    variant: "arms",
    dbSha256: baseline.dbSha256,
    baselineSha256: simulationHash(baseline),
    feedbackReviewSha256: simulationHash(review),
    nativeBinarySha256: review.nativeBinarySha256,
    challenges: [best],
    bestConfirmed: best,
    validationSeeds: [4000000, 4100000],
    screeningSeed: 3000000,
    screeningIterations: 2000,
  };
  const before = globalThis.structuredClone(baseline);
  const settings = accessoryFeedbackSettings(baseline, review, audit, db, sources);
  assert.deepEqual(settings.player.equipment, challenge.gear);
  assert.deepEqual(baseline, before);
  for (const change of [
    { status: "no-confirmed-challenger" },
    { feedbackReviewSha256: "b".repeat(64) },
    { dbSha256: "c".repeat(64) },
    { bestConfirmed: null },
    { bestConfirmed: { ...best, averageDpsDifference: 999 } },
    { validationSeeds: [3000000, 3000000] },
  ])
    assert.throws(() =>
      accessoryFeedbackSettings(baseline, review, { ...audit, ...change }, db, sources),
    );
  const weaker = comparisons.map((row) => ({ ...row, candidate: { ...row.candidate, dps: 99 } }));
  const fake = { challenge, ...accessoryChallengeVerdict(weaker), confirmed: true };
  assert.throws(() =>
    accessoryFeedbackSettings(
      baseline,
      review,
      { ...audit, bestConfirmed: fake, challenges: [fake] },
      db,
      sources,
    ),
  );
  const illegal = { ...best, challenge: { ...challenge, id: "f".repeat(64) } };
  assert.throws(() =>
    accessoryFeedbackSettings(
      baseline,
      review,
      { ...audit, bestConfirmed: illegal, challenges: [illegal] },
      db,
      sources,
    ),
  );
});

test("accessory challenges cover ordered legal pairs, preserve other gear and do not use EP/ilvl cutoffs", () => {
  const input = accessoryFixture();
  input.db.items.push(fixture(2001, 12, { ilvl: 1, quality: 1 }));
  input.sources.set(2001, source());
  const before = globalThis.structuredClone(input);
  const bank = createAccessoryChallenges(input.baseline, input.db, input.sources, "trinkets");
  assert.equal(bank.candidates.length, 9);
  assert.equal(bank.candidates[0].id, bank.incumbentId);
  assert(bank.candidates.some((entry) => entry.itemIds.join() === "2001,1012"));
  assert(bank.candidates.some((entry) => entry.itemIds.join() === "1012,2001"));
  assert(bank.candidates.some((entry) => entry.itemIds.join() === "2001,2001"));
  for (const entry of bank.candidates)
    for (let slot = 0; slot < 17; slot++)
      if (![12, 13].includes(slot))
        assert.deepEqual(
          entry.gear.items[slot],
          input.baseline.settings.player.equipment.items[slot],
        );
  assert.deepEqual(input, before);
  const explicitZero = globalThis.structuredClone(input);
  explicitZero.baseline.settings.player.equipment.items[12].enchant = 0;
  explicitZero.baseline.settings.player.equipment.items[13].enchant = 0;
  assert.equal(
    createAccessoryChallenges(
      explicitZero.baseline,
      explicitZero.db,
      explicitZero.sources,
      "trinkets",
    ).candidates.length,
    9,
  );
  assert.deepEqual(
    createAccessoryChallenges(input.baseline, input.db, input.sources, "rings").slots,
    [10, 11],
  );
});

test("accessory challenges enforce unique and mutually exclusive rewards and current legality", () => {
  const input = accessoryFixture();
  for (const id of [2001, 2002]) {
    input.db.items.push(fixture(id, 12));
    input.sources.set(id, source({ questChoice: "one-reward" }));
  }
  input.db.items.push(fixture(2003, 12, { unique: true }));
  input.sources.set(2003, source());
  const bank = createAccessoryChallenges(input.baseline, input.db, input.sources, "trinkets");
  assert(!bank.candidates.some((entry) => entry.itemIds.every((id) => [2001, 2002].includes(id))));
  assert(!bank.candidates.some((entry) => entry.itemIds.join() === "2003,2003"));
  for (const corrupt of [
    (item, src) => {
      src.sources = [{ kind: "dungeon", zoneId: 2717 }];
    },
    (item) => {
      item.classAllowlist = [8];
    },
    (item) => {
      item.factionRestriction = 2;
    },
    (item, src) => {
      src.requiredLevel = 61;
    },
    (item, src) => {
      src.sources = [{ kind: "crafted" }];
    },
  ]) {
    const altered = globalThis.structuredClone(input);
    corrupt(
      altered.db.items.find((item) => item.id === 2003),
      altered.sources.get(2003),
    );
    assert(
      !createAccessoryChallenges(
        altered.baseline,
        altered.db,
        altered.sources,
        "trinkets",
      ).candidates.some((entry) => entry.itemIds.includes(2003)),
    );
  }
  assert.throws(() => createAccessoryChallenges(input.baseline, input.db, input.sources, "weapon"));
  input.baseline.settings.player.equipment.items[12].enchant = 999;
  assert.throws(
    () => createAccessoryChallenges(input.baseline, input.db, input.sources, "trinkets"),
    /enchants/,
  );
  delete input.baseline.settings.player.equipment.items[12].enchant;
  input.baseline.settings.player.equipment.items[0].randomSuffix = 1;
  assert.throws(
    () => createAccessoryChallenges(input.baseline, input.db, input.sources, "trinkets"),
    /equipment-spec/,
  );
});

test("accessory shortlist retains uncertain ties and higher means instead of a fixed top-N cutoff", () => {
  const row = (id, dps) => ({ challenge: { id }, dps, stdev: 40, iterations: 2000 });
  const rows = [row("incumbent", 1000), row("near", 999), row("higher", 1001), row("far", 980)];
  assert.deepEqual(
    shortlistAccessoryChallenges(rows, "incumbent").map((entry) => entry.challenge.id),
    ["higher", "near"],
  );
  assert.throws(() => shortlistAccessoryChallenges(rows, "missing"));
  assert.throws(() => shortlistAccessoryChallenges([rows[0], rows[0]], "incumbent"));
  assert.throws(() => shortlistAccessoryChallenges([{ ...rows[0], iterations: 500 }], "incumbent"));
});

test("accessory confirmation requires high-precision gains in both disjoint ranges", () => {
  const metric = (dps) => ({ dps, stdev: 30, iterations: 100000 });
  const rows = [1000000, 1100000].map((seed) => ({
    seed,
    baseline: metric(1000),
    candidate: metric(1001),
  }));
  const result = accessoryChallengeVerdict(rows);
  assert.equal(result.confirmed, true);
  assert.equal(result.averageDpsDifference, 1);
  const mixed = globalThis.structuredClone(rows);
  mixed[1].candidate.dps = 999;
  assert.equal(accessoryChallengeVerdict(mixed).confirmed, false);
  const noise = globalThis.structuredClone(rows);
  noise.forEach((row) => {
    row.candidate.dps = 1000.01;
  });
  assert.equal(accessoryChallengeVerdict(noise).confirmed, false);
  const overlap = globalThis.structuredClone(rows);
  overlap[1].seed = 1050000;
  assert.throws(() => accessoryChallengeVerdict(overlap), /Overlapping/);
  assert.throws(() => accessoryChallengeVerdict(rows.slice(0, 1)));
  rows[0].candidate.iterations = 20000;
  assert.throws(() => accessoryChallengeVerdict(rows), /precision/);
});

test("accessory audit CLI rejects missing, duplicate and unsupported flags before reading evidence", () => {
  const script = new URL("./audit-simulator-accessories.mjs", import.meta.url);
  for (const args of [
    [],
    ["--kind=trinkets"],
    ["--kind=rings", "--kind=trinkets"],
    ["--feedback-review=missing.json", "--kind=weapon"],
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(script), ...args], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pass --feedback-review|Choose rings or trinkets/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});

test("accessory confirmation batching shares controls and preserves both candidate/range mappings", () => {
  const metric = (dps) => ({ dps, stdev: 30, iterations: 100000 });
  const results = [1000, 1001, 999, 1000, 1002, 998].map(metric);
  const verdicts = accessoryConfirmationResults(results, [1000000, 1100000], 2);
  assert.deepEqual(
    verdicts.map((row) => row.confirmed),
    [true, false],
  );
  assert.deepEqual(
    verdicts.map((row) => row.averageDpsDifference),
    [1.5, -1.5],
  );
  assert.equal(verdicts[0].comparisons[1].candidate.dps, 1002);
  assert.throws(
    () => accessoryConfirmationResults(results.slice(0, -1), [1000000, 1100000], 2),
    /Incomplete/,
  );
  assert.deepEqual(
    accessoryConfirmationResults([metric(1000), metric(1000)], [1000000, 1100000], 0),
    [],
  );
  assert.throws(
    () => accessoryConfirmationResults([metric(1000), metric(1000)], [1000000, 1000000], 0),
    /Overlapping/,
  );
});

test("set proposals include every subset rather than only EP-greedy piece counts", () => {
  const pieces = [
    [0, "head"],
    [2, "shoulders"],
    [4, "chest"],
    [6, "hands"],
  ];
  const combinations = [...prebisSetSubsets(pieces)];
  assert.equal(combinations.length, 11);
  assert(combinations.some((entries) => entries.map(([slot]) => slot).join(",") === "0,4,6"));
  assert.equal([...prebisSetSubsets([[0, "single"]])].length, 0);
  assert.throws(() => [...prebisSetSubsets(Array(18).fill([0, "invalid"]))], /17 equipment/);
});

test("acquisition context uses faction-correct sources and never labels Maiden's Circle as PvP", () => {
  const items = new Map([19325, 13001, 271908, 272064].map((id) => [id, fixture(id, 11)]));
  const sources = prebisSources(
    { items: [] },
    { items: [] },
    { schema: "kfc-prebis-craft-acquisition.v1", items: [] },
    items,
  );
  assert.equal(sources.get(13001).sources[0].kind, "classic-pre-raid");
  assert.equal(sources.get(271908).sources[0].faction, "Alliance");
  assert.equal(sources.get(272064).sources[0].faction, "Horde");
  const baseline = {
    profile: "warrior",
    playerClass: 9,
    settings: {
      settings: { faction: "Alliance" },
      player: {
        race: "RaceHuman",
        profession1: "Engineering",
        profession2: "Blacksmithing",
        equipment: { items: [{ id: 271908 }] },
      },
    },
  };
  assert.deepEqual(prebisContext(baseline, items).professions, [4, 2]);
  assert.equal(prebisContext(baseline, items).faction, 1);
  baseline.settings.player.race = "RaceOrc";
  assert.throws(() => prebisContext(baseline, items), /disagree/);
  baseline.settings.player.race = "RaceHuman";
  baseline.settings.player.profession2 = "Engineering";
  assert.throws(() => prebisContext(baseline, items), /distinct/);
  baseline.settings.player.race = "Unknown";
  assert.throws(() => prebisContext(baseline, items), /Unknown/);
});

test("Classic imports preserve current Forever data and skip current-but-unreviewed records", () => {
  const current = fixture(11815, 12, { stats: Array(44).fill(123) });
  const equipment = { items: [current] };
  const result = mergeClassicPrebis(equipment, reference, new Set([21563, 15855]));
  assert.deepEqual(equipment, { items: [current] });
  assert.deepEqual(
    result.equipment.items.find((item) => item.id === 11815),
    current,
  );
  assert(!result.equipment.items.some((item) => [21563, 15855, 11832].includes(item.id)));
  assert(result.manifest.items.every((item) => item.status === "classic-provisional"));
  assert.equal(result.equipment.items.find((item) => item.id === 13965).stats[19], 2);
  assert.match(reference.license, /MIT License/);
  assert.throws(
    () => mergeClassicPrebis(equipment, { ...reference, revision: "latest" }, new Set()),
    /Unreviewed/,
  );
});

test("candidate filtering uses the actual proto wrist/waist and ranged slot enums", () => {
  assert.deepEqual(prebisSlotTypes.slice(5, 10), [6, 7, 8, 9, 10]);
  assert(eligiblePrebis(fixture(1, 6), source({ raceMasks: [-1, -1] }), context, 5));
  assert(!eligiblePrebis(fixture(1, 8), source(), context, 5));
  assert(eligiblePrebis(fixture(2, 14, { rangedWeaponType: 3 }), source(), context, 16));
  const mage = { ...context, playerClass: 3 };
  assert(eligiblePrebis(fixture(3, 14, { rangedWeaponType: 8 }), source(), mage, 16));
  assert(!eligiblePrebis(fixture(4, 14, { rangedWeaponType: 5 }), source(), mage, 16));
});

test("pre-raid legality rejects raid loot, wrong faction/class/profession, projections and unresolved suffixes", () => {
  const item = fixture(1, 12);
  assert(eligiblePrebis(item, source(), context, 12));
  for (const metadata of [
    source({ sources: [{ kind: "dungeon", zoneId: 2717 }] }),
    source({ sources: [{ kind: "raid" }] }),
    source({ requiredLevel: 61 }),
    source({ requiredSkill: 197 }),
    source({ sources: [{ kind: "pvp", faction: "Alliance" }] }),
  ])
    assert(!eligiblePrebis(item, metadata, context, 12));
  for (const extra of [
    { classAllowlist: [3] },
    { requiredProfession: 11 },
    { factionRestriction: 1 },
    { effectItemId: 123 },
    { randomSuffixOptions: [123] },
  ])
    assert(!eligiblePrebis({ ...item, ...extra }, source(), context, 12));
});

test("whole-set legality rejects unique categories and mutually exclusive quest rewards", () => {
  const items = new Map(
    [fixture(1, 12, { unique: true }), fixture(2, 12)].map((item) => [item.id, item]),
  );
  const gear = { items: Array.from({ length: 17 }, () => ({})) };
  gear.items[12] = { id: 1 };
  gear.items[13] = { id: 1 };
  assert(!legalPrebisGear(gear, items, new Map([[1, source()]]), context));
  gear.items[13] = { id: 2 };
  assert(
    !legalPrebisGear(
      gear,
      items,
      new Map([
        [1, source({ limitCategory: 707 })],
        [2, source({ limitCategory: 707 })],
      ]),
      context,
    ),
  );
  assert(
    !legalPrebisGear(
      gear,
      items,
      new Map([
        [1, source({ questChoice: "same-quest" })],
        [2, source({ questChoice: "same-quest" })],
      ]),
      context,
    ),
  );
  assert(
    legalPrebisGear(
      gear,
      items,
      new Map([
        [1, source()],
        [2, source()],
      ]),
      context,
    ),
  );
});

test("sampling noise is not published as an improvement", () => {
  const baseline = { dps: 500, stdev: 20, iterations: 100 };
  assert(!statisticallyBetter({ ...baseline, dps: 501 }, baseline));
  assert(!statisticallyBetter({ ...baseline, dps: 499 }, baseline));
  assert(statisticallyBetter({ ...baseline, dps: 510 }, baseline));
});

test("two identical non-unique rings are legal candidates", () => {
  const ring = fixture(18500, 11);
  const gear = { items: Array.from({ length: 17 }, () => ({})) };
  gear.items[10] = { id: 18500 };
  gear.items[11] = { id: 18500 };
  assert(legalPrebisGear(gear, new Map([[18500, ring]]), new Map([[18500, source()]]), context));
  assert(
    !legalPrebisGear(
      gear,
      new Map([[18500, { ...ring, unique: true }]]),
      new Map([[18500, source()]]),
      context,
    ),
  );
});

test("one-time rewards cannot be equipped twice even when the client omits Unique", () => {
  const gear = { items: Array.from({ length: 17 }, () => ({})) };
  const trinket = fixture(13965, 12);
  const items = new Map([[trinket.id, trinket]]);
  const sources = new Map([[trinket.id, source({ questChoice: "drakkisath-reward" })]]);
  gear.items[12] = { id: trinket.id };
  gear.items[13] = { id: trinket.id };
  assert(!legalPrebisGear(gear, items, sources, context));
  gear.items[13] = {};
  assert(legalPrebisGear(gear, items, sources, context));
});

test("a quest-only weapon cannot be duplicated without repeatability evidence", () => {
  const weapon = fixture(15806, 13, {
    weaponType: 8,
    handType: 2,
    sources: [{ quest: { id: 5384 } }],
  });
  const gear = { items: Array.from({ length: 17 }, () => ({})) };
  gear.items[14] = { id: weapon.id };
  gear.items[15] = { id: weapon.id };
  const equippedContext = {
    ...context,
    originalItems: Array.from({ length: 17 }, (_, slot) =>
      slot >= 14 && slot <= 15 ? weapon : null,
    ),
  };
  assert(
    !legalPrebisGear(
      gear,
      new Map([[weapon.id, weapon]]),
      new Map([[weapon.id, source({ sources: [{ kind: "dungeon-quest", questId: 5384 }] })]]),
      equippedContext,
    ),
  );
});
