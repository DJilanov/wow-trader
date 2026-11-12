import assert from "node:assert/strict";
import { test } from "node:test";
import { CampaignFundingPool } from "../packages/leveling/dist/node.js";
import { campaignFundingStates, campaignFundingScenarios, campaignFundingState, fundCampaignQuestGaps, prepareCampaignPlan } from "../packages/leveling/dist/index.js";

function route(starterOnly = false, shared = false) {
  const action = { id: "entry", legId: "prepare", title: "Elwynn patrol", kind: "xp-check",
    questChanges: [], positions: [], source: null, leaderOnly: false, raidOnly: false,
    targetLevel: 2, targetStopId: null };
  return { release: "worker-equivalence-test", race: "human", leaderClass: "warrior", targetBuild: 70205,
    ...(shared ? { sharedQuestsOnly: true } : {}), actions: [action],
    legs: [{ id: "prepare", title: "Elwynn", kind: starterOnly ? "starter" : "preparation",
      from: 1, to: 2, stopId: null, actionIds: [action.id], questIds: [], unresolvedQuestIds: [] }] };
}

test("workers preserve every serial scenario, event and optional field in canonical order", async () => {
  const pool = new CampaignFundingPool({ workers: 3, minimumActions: 0 });
  try {
    for (const plan of [route(), route(false, true), route(true), route(true, true)]) {
      const before = globalThis.structuredClone(plan), expected = campaignFundingStates(plan);
      assert.deepEqual(campaignFundingScenarios(plan).map((scenario) => campaignFundingState(plan, scenario)), expected);
      assert.deepEqual(pool.execute(plan), expected);
      assert.deepEqual(plan, before);
    }
    assert.equal(pool.statistics.parallelBatches, 4);
    assert.equal(pool.statistics.workerThreadIds.length, 3);
    assert.equal(pool.statistics.scenarios, 78);
    assert.deepEqual(pool.execute(route()), campaignFundingStates(route()));
  } finally { await pool.close(); }
  assert.throws(() => pool.execute(route()), /closed/);
});

test("the production preparation and funding APIs use the explicit executor", async () => {
  let calls = 0;
  const execute = (plan) => { calls++; return campaignFundingStates(plan); };
  const catalog = { schema: "forever-quest-funding-catalog.v1", targetBuild: 70205, publication: "private-reference",
    authorizationNote: "Synthetic executor contract", providerRevision: "a".repeat(40), questSha256: "b".repeat(64),
    npcSha256: "c".repeat(64), areaMapSha256: "d".repeat(64), sourceArchiveSha256: "e".repeat(64),
    includesAuthoredCorrections: false, quests: [] };
  const combat = { schema: "forever-combat-reference.v1", targetBuild: 70205, publication: "private-reference",
    authorizationNote: "Synthetic executor contract", provider: { repository: "https://example.test/worker-test",
      revision: catalog.providerRevision, questSha256: catalog.questSha256, npcSha256: catalog.npcSha256,
      itemSha256: "f".repeat(64), layer: "forever-static-with-authored", limitations: ["Synthetic test"] },
    npcs: [], quests: [], dungeons: [], killXpEvidence: [] };
  const plan = route(true);
  const serial = fundCampaignQuestGaps(plan, [], combat, catalog);
  assert.deepEqual(fundCampaignQuestGaps(plan, [], combat, catalog, { fundingExecutor: execute }), serial);
  assert(calls > 0);
  const before = calls, evidence = { starters: { entries: [], routes: [] }, rewardFacts: [], rewardRevision: "test",
    rewardBuild: null, rewardNotice: null, combat: { data: combat, revision: "test" }, questCatalog: catalog };
  assert.deepEqual(prepareCampaignPlan(plan, [], evidence, { fundingExecutor: execute }), prepareCampaignPlan(plan, [], evidence));
  assert(calls > before);
  const pool = new CampaignFundingPool({ workers: 2, minimumActions: 0 });
  try {
    assert.deepEqual(fundCampaignQuestGaps(plan, [], combat, catalog, { fundingExecutor: pool.execute }), serial);
    assert.deepEqual(prepareCampaignPlan(plan, [], evidence, { fundingExecutor: pool.execute }), prepareCampaignPlan(plan, [], evidence));
    assert(pool.statistics.parallelBatches > 0);
    const position = { zone: "1429", x: 50, y: 50 }, giver = {
      npcId: 234, name: "Test captain", friendlyToAlliance: true, positions: [position],
    };
    const candidates = [300002, 300003].map((questId) => ({ questId, title: `Patrol ${questId}`,
      minimumLevel: 1, questLevel: 2, requiredRaces: 0, requiredClasses: 0, starts: [giver], ends: [giver],
      prerequisites: { allOf: [], anyOf: [] }, exclusiveWith: [], category: "shared-kills",
      objectives: [{ index: 1, npcId: 114, count: 10, positions: [position] }], unsupportedRequirements: [] }));
    const data = { ...combat, npcs: [{ id: 114, name: "Test spider", minimumLevel: 1, maximumLevel: 1,
      rank: 0, zoneIds: [12], xpEligibility: "assumed" }], quests: candidates.map((quest) => ({
        questId: quest.questId, creatureIds: [114], itemCreatureIds: [], onlyCreatureObjectives: true,
        objectiveText: ["Kill ten spiders."], killQuotas: [{ objectiveIndex: 1, npcId: 114, kills: 10, source: "Synthetic test" }],
      })) };
    const located = { ...plan.actions[0], id: "location", kind: "instructions", targetLevel: null,
      positions: [{ sourceLine: 0, position: { ...position, floor: null, space: "map-percent" } }] };
    const candidatePlan = { ...plan, actions: [located, plan.actions[0]],
      legs: plan.legs.map((leg) => ({ ...leg, actionIds: [located.id, plan.actions[0].id] })),
      rewardFacts: candidates.map((quest) => ({ questId: quest.questId, questLevel: 2, minimumLevel: 1,
        fullXp: 500, xpByLevel: [], status: "available", sourceUrl: "https://example.test/reward", capturedAt: "2026-11-04T00:00:00Z" })) };
    const candidateCatalog = { ...catalog, quests: candidates };
    const expected = fundCampaignQuestGaps(candidatePlan, [], data, candidateCatalog);
    assert.deepEqual(expected.questFunding.addedQuestIds, [300002]);
    assert.deepEqual(fundCampaignQuestGaps(candidatePlan, [], data, candidateCatalog, { fundingExecutor: pool.execute }), expected);
  } finally { await pool.close(); }
});

test("one worker and small routes use the identical serial path", async () => {
  for (const options of [{ workers: 1 }, { workers: 4, minimumActions: 100 }]) {
    const pool = new CampaignFundingPool(options);
    try {
      assert.deepEqual(pool.execute(route()), campaignFundingStates(route()));
      assert.equal(pool.statistics.parallelBatches, 0);
      assert.equal(pool.statistics.serialBatches, 1);
      assert.deepEqual(pool.statistics.workerThreadIds, []);
    } finally { await pool.close(); }
  }
});

test("an explicit scenario scope has identical serial and parallel results in canonical order", async () => {
  const plan = route(false, true);
  const selected = campaignFundingScenarios(plan).filter((scenario) => scenario.difficultyPolicy === "experienced-premade" &&
    scenario.strategy === "dungeons" && scenario.optionalStops);
  assert.equal(selected.length, 3);
  const expected = selected.map((scenario) => campaignFundingState(plan, scenario));
  for (const workers of [1, 3]) {
    const requested = globalThis.structuredClone(selected).reverse();
    const pool = new CampaignFundingPool({ workers, minimumActions: 0, scenarios: requested });
    requested.length = 0;
    try {
      assert.deepEqual(pool.execute(plan), expected);
      assert.equal(pool.statistics.scenarios, 3);
      assert.equal(pool.statistics.parallelBatches, workers === 1 ? 0 : 1);
      assert.equal(pool.statistics.serialBatches, workers === 1 ? 1 : 0);
      assert.equal(pool.statistics.workerThreadIds.length, workers === 1 ? 0 : 3);
    } finally { await pool.close(); }
  }
});

test("scenario scope rejects empty, repeated and unavailable cases", async () => {
  const selected = campaignFundingScenarios(route(false, true)).filter((scenario) => scenario.difficultyPolicy === "experienced-premade");
  assert.throws(() => new CampaignFundingPool({ scenarios: [] }), /scenario selection/);
  assert.throws(() => new CampaignFundingPool({ scenarios: [selected[0], selected[0]] }), /scenario selection/);
  const pool = new CampaignFundingPool({ scenarios: selected });
  try { assert.throws(() => pool.execute(route(true, true)), /scenario is unavailable/); }
  finally { await pool.close(); }
});

test("a failed worker rejects the whole batch instead of accepting partial forecasts", async () => {
  const pool = new CampaignFundingPool({ workers: 2, minimumActions: 0 });
  try {
    const plan = route(); plan.legs[0].bundleId = "missing-test-bundle";
    assert.throws(() => pool.execute(plan), /Unknown funding-scenario bundle/);
    assert.throws(() => pool.execute(route()), /closed/);
  } finally { await pool.close(); }
});

test("a worker deadline terminates the pool and fails explicitly", async () => {
  const pool = new CampaignFundingPool({ workers: 2, minimumActions: 0, timeoutMs: 1 });
  try {
    assert.throws(() => pool.execute(route()), /timed out/);
    assert.throws(() => pool.execute(route()), /closed/);
  } finally { await pool.close(); }
});

test("worker count and deadlines reject invalid values", () => {
  for (const workers of [0, -1, 1.5, 65, NaN]) assert.throws(() => new CampaignFundingPool({ workers }), /workers/);
  for (const timeoutMs of [0, NaN, Infinity, 3_600_001]) assert.throws(() => new CampaignFundingPool({ timeoutMs }), /timeout/);
  assert.throws(() => new CampaignFundingPool({ minimumActions: -1 }), /threshold/);
});
