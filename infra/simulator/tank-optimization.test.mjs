import assert from "node:assert/strict";
import test from "node:test";
import {
  tankGearProposals,
  tankCandidatePools,
  tankSearchGroups,
  tankSearchMetric,
  tankObjectiveScore,
  tankImprovement,
  admitPublishedTankSources,
  shortlistTankCandidates,
} from "./tank-optimization.mjs";
import { tankStarterDefinitions } from "./tank-starters-adapter.mjs";

function fixture(entries, slots) {
  const db = {
    items: entries.map(([id, type, properties]) => ({
      id,
      type,
      stats: Array(44).fill(0),
      ...properties,
    })),
  };
  const items = new Map(db.items.map((item) => [item.id, item]));
  const gear = { items: Array.from({ length: 17 }, (_, index) => ({ id: slots[index] ?? 0 })) };
  const sources = new Map(
    db.items.map((item) => [item.id, { requiredLevel: 60, sources: [{ kind: "dungeon" }] }]),
  );
  const context = {
    playerClass: 9,
    profile: "tank_warrior",
    faction: 1,
    factionName: "Alliance",
    professions: [2, 3],
    currentIds: new Set(Object.values(slots).filter(Boolean)),
    originalItems: gear.items.map((item) => items.get(item.id)),
    requireCraftAudit: true,
  };
  const pools = tankCandidatePools(db, sources, context);
  return { db, gear, sources, context, pools };
}

function proposals(f, group) {
  return tankGearProposals(
    f.gear,
    group,
    f.pools,
    f.db,
    f.sources,
    f.context,
    { enchants: {} },
    { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: [] },
  );
}

test("jewelry searches include all legal pairs and duplicates, enforcing unique and quest ownership", () => {
  const f = fixture(
    [
      [1, 11],
      [2, 11],
      [3, 11, { unique: true }],
      [4, 11],
      [5, 11],
    ],
    { 10: 1, 11: 2 },
  );
  for (const id of [4, 5])
    f.sources.set(id, {
      requiredLevel: 60,
      questChoice: "one-reward",
      sources: [{ kind: "classic-pre-raid" }],
    });
  const keys = new Set(
    proposals(f, [10, 11]).map((gear) => `${gear.items[10].id}/${gear.items[11].id}`),
  );
  assert(keys.has("1/1"));
  assert(keys.has("2/2"));
  assert(keys.has("3/1"));
  assert(keys.has("1/3"));
  for (const key of ["3/3", "4/4", "4/5", "5/4"]) assert(!keys.has(key));
});

test("set search retains lower-stat alternatives and every eligible piece subset", () => {
  const f = fixture(
    [
      [1, 1],
      [2, 3],
      [10, 1, { setId: 189 }],
      [11, 1, { setId: 189 }],
      [12, 3, { setId: 189 }],
      [13, 5, { setId: 189 }],
      [3, 5],
    ],
    { 0: 1, 2: 2, 4: 3 },
  );
  const keys = new Set(
    proposals(f, ["sets"]).map((gear) => [0, 2, 4].map((slot) => gear.items[slot].id).join("/")),
  );
  for (const key of ["10/12/3", "11/12/3", "10/2/13", "1/12/13", "10/12/13", "11/12/13"])
    assert(keys.has(key), `missing ${key}`);
});

test("tank pools have no item-level floor or EP exclusion, and preserve shield geometry", () => {
  const f = fixture(
    [
      [1, 13, { weaponType: 9, handType: 1 }],
      [2, 13, { weaponType: 7, handType: 3 }],
      [3, 13, { weaponType: 1, handType: 4 }],
      [4, 13, { weaponType: 9, handType: 1, ilvl: 10 }],
      [5, 13, { weaponType: 7, handType: 3 }],
    ],
    { 14: 1, 15: 2 },
  );
  assert(f.pools[14].some((item) => item.id === 4));
  assert(!f.pools[14].some((item) => item.id === 3));
  assert.deepEqual(
    f.pools[15].map((item) => item.id),
    [2, 5],
  );
  const pairs = proposals(f, [14, 15]);
  assert(pairs.some((gear) => gear.items[14].id === 4 && gear.items[15].id === 5));
});

test("current Bear weapon style includes all eligible two-handed polearms", () => {
  const f = fixture(
    [
      [1, 13, { weaponType: 6, handType: 4 }],
      [2, 13, { weaponType: 6, handType: 4 }],
      [3, 13, { weaponType: 4, handType: 4 }],
      [4, 13, { weaponType: 9, handType: 4 }],
    ],
    { 14: 1 },
  );
  f.context.playerClass = 1;
  f.context.profile = "feral_tank_druid";
  const pools = tankCandidatePools(f.db, f.sources, f.context);
  assert.deepEqual(
    pools[14].map((item) => item.id),
    [1, 2, 3],
  );
});

test("separately published PvP armor retains acquisition limits and cannot admit arbitrary IDs", () => {
  const definition = tankStarterDefinitions.feral_tank_druid;
  const items = new Map(
    definition.core.map((id) => [id, { id, classAllowlist: [1], ilvl: 60, quality: 3 }]),
  );
  const sources = new Map([[definition.core[0], { verified: true }]]);
  const added = admitPublishedTankSources(
    sources,
    "feral_tank_druid",
    { core: definition.core },
    items,
  );
  assert.equal(added.length, 7);
  assert.equal(sources.get(definition.core[0]).verified, true);
  assert(added.every((source) => source.acquisitionProvenance === "published-starter-provisional"));
  assert.throws(
    () => admitPublishedTankSources(new Map(), "feral_tank_druid", { core: [999] }, items),
    /changed/,
  );
  items.get(definition.core[1]).classAllowlist = [4];
  assert.throws(
    () =>
      admitPublishedTankSources(new Map(), "feral_tank_druid", { core: definition.core }, items),
    /Invalid/,
  );
});

function metric(threat, dtps, health = 5000, stdev = 10, iterations = 20000) {
  return {
    metrics: { threat: { avg: threat, stdev }, dtps: { avg: dtps, stdev } },
    health,
    iterations,
  };
}

test("objectives use TPS and physical DTPS, with a shared explicit health floor", () => {
  const base = metric(900, 500),
    faster = metric(1100, 600),
    safer = metric(850, 400);
  assert(tankImprovement(faster, base, "threat", 5000));
  assert(!tankImprovement(faster, base, "mitigation", 5000));
  assert(tankImprovement(safer, base, "mitigation", 5000));
  assert.equal(tankObjectiveScore(metric(2000, 200, 4999), "threat", 5000), -Infinity);
  assert.equal(tankObjectiveScore(metric(2000, 200, 4999), "mitigation", 5000), -Infinity);
});

test("independent confirmation rejects gains inside sampling noise and invalid metrics", () => {
  const base = metric(900, 500, 5000, 100, 100);
  assert(!tankImprovement(metric(901, 499, 5000, 100, 100), base, "threat", 5000, true));
  assert(tankImprovement(metric(1000, 400, 5000, 100, 100), base, "threat", 5000, true));
  assert.throws(() => tankSearchMetric(metric(NaN, 500), "threat"), /Invalid/);
  assert.throws(() => tankSearchMetric(base, "dps"), /Unknown/);
});

test("shortlisting retains uncertain lower means beyond a fixed top-N cutoff", () => {
  const best = metric(1000, 300, 5000, 1, 80),
    uncertain = metric(950, 350, 5000, 500, 80),
    bad = metric(500, 800, 5000, 1, 80);
  assert.deepEqual(shortlistTankCandidates([bad, uncertain, best], "threat", 0, 1), [
    best,
    uncertain,
  ]);
  assert.deepEqual(shortlistTankCandidates([bad, uncertain, best], "mitigation", 0, 1), [
    best,
    uncertain,
  ]);
  assert.deepEqual(shortlistTankCandidates([metric(2000, 100, 4999), best], "threat", 5000, 1), [
    best,
  ]);
});

test("search covers all item slots, jewelry and weapon pairs, and every enchant slot", () => {
  const groups = tankSearchGroups(Array.from({ length: 17 }, () => [{}]));
  assert(groups.some((group) => group[0] === "sets"));
  for (const pair of [
    [10, 11],
    [12, 13],
    [14, 15],
  ])
    assert(groups.some((group) => JSON.stringify(group) === JSON.stringify(pair)));
  for (let slot = 0; slot < 17; slot++)
    assert(groups.some((group) => group[0] === `enchant:${slot}`));
});
