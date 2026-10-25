import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import { createPaladinHealingSpellPolicy } from "./paladin-healing-eligibility.mjs";
import {
  extractPaladinHealingTalentDomain,
  paladinHealingTalentSeeds,
} from "./paladin-healing-talents.mjs";
import { paladinHealingPriorityCandidates } from "./paladin-healing-feedback-v2.mjs";
import { assertPaladinAssignmentHealingJob } from "./paladin-assignment-protocol.mjs";
import {
  createPaladinHealingScenarioWorkload,
  paladinHealingScenarios,
} from "./paladin-healing-scenarios.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url))));
const books = fixture("healer-spell-eligibility-source.v1.json.gz"),
  spellPolicy = createPaladinHealingSpellPolicy({
    baseline: fixture("paladin-baseline-source.v1.json.gz"),
    actives: fixture("paladin-healing-actives-source.v1.json.gz"),
    books: linkClientRaidSpellBooks({
      reference: extractClassicRaidSpellBooks(books.atlas.source),
      tables: new Map(Object.entries(books.tables)),
      source: books.source,
    }),
  }),
  seed = paladinHealingTalentSeeds(
    extractPaladinHealingTalentDomain(fixture("paladin-healing-talents-source.v1.json.gz")),
  )[0],
  source = fixture("paladin-healing-gear-bank-source.v1.json.gz"),
  setSource = fixture("paladin-healing-sets-source.v1.json.gz"),
  extraItems = fixture("paladin-healing-scenario-items.v1.json.gz"),
  items = new Map(
    [...source.items, ...setSource.items, ...extraItems.items].map((row) => [row.id, row]),
  ),
  request = JSON.parse(
    readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
  ).request;
const option = {
    state: seed,
    policy: paladinHealingPriorityCandidates(spellPolicy, seed.fields).find(
      (row) => row.holyShock && row.lightsVigil,
    ),
    gear: source.seed,
    consumes: { flask: 2, food: 4, mainHandImbue: 16, defaultPotion: 5, defaultConjured: 2 },
    manaRegenElixir: 2,
    useUtilities: true,
    requireVigil: false,
    favorMinimumBaseCost: 300,
    minimumPartyTargets: 0,
    minimumPartyMissingHealth: 0,
    resourceOrder: "as-declared",
  },
  input = { option, kind: "group", durationSeconds: 180, damagePerSecond: 600, spellPolicy, items };
const extraBytes = readFileSync(
  new URL("./fixtures/paladin-healing-scenario-items.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(extraBytes).digest("hex"),
  "f20a6784cdeb05395a6fe2c90589eda288dce0912d0e89bc34b554172e8d05c8",
);
assert.equal(extraItems.itemsAreExactCatalogSubsets, true);
function ownedSet(setId, count) {
  const gear = structuredClone(option.gear),
    entries = setSource.items.filter((item) => item.setId === setId).slice(0, count);
  assert.equal(entries.length, count);
  for (const [index, item] of entries.entries()) gear.items[index] = { id: item.id };
  return { ...input, option: { ...option, gear } };
}
function ownsItem(itemId) {
  const gear = structuredClone(option.gear);
  gear.items[12] = { id: itemId };
  return { ...input, option: { ...option, gear } };
}

test("Paladin scenarios have stable unique identities and separate conditional references", () => {
  const rows = paladinHealingScenarios();
  assert.equal(rows.length, 24);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.equal(rows.filter((row) => row.kind === "comparison").length, 21);
  assert.equal(rows.filter((row) => row.kind === "conditional").length, 3);
  rows[0].id = "changed";
  assert.equal(paladinHealingScenarios()[0].id, "reference");
  assert.throws(() =>
    createPaladinHealingScenarioWorkload({ ...input, scenarioId: "invented-policy" }),
  );
});

test("every plain equipped scenario remains a full-build external-demand request without ownerless policies", () => {
  const before = structuredClone(option);
  for (const scenario of paladinHealingScenarios()) {
    const workload = createPaladinHealingScenarioWorkload({ ...input, scenarioId: scenario.id });
    assertPaladinAssignmentHealingJob({ ...request, workload });
    assert.equal(workload.requireFullTalentBuild, true);
    assert.equal(workload.assignmentScoring, "external-demand-v1");
    assert.equal(workload.itemEffectsPolicy, undefined);
    assert.equal(workload.castSetPolicy, undefined);
    assert.equal(workload.selfSetPolicy, undefined);
    assert.equal(workload.itemArea, undefined);
    assert.equal(workload.utilityHealingCanCrit, undefined);
    assert.equal(workload.recombobulatorCanCrit, undefined);
  }
  assert.deepEqual(option, before);
});

test("cast-set uncertainty changes only the actual five-piece owner and its declared rate", () => {
  for (const [setId, field, expected] of [
    [185, "wildheartManaChance", 0.05],
    [187, "spellPowerChance", 1],
    [188, "spellPowerChance", 1],
    [183, "dreadmistCanCrit", true],
  ]) {
    const workload = createPaladinHealingScenarioWorkload({
      ...ownedSet(setId, 5),
      scenarioId: "cast-procs-high",
    });
    assert.equal(workload.castSetPolicy[field], expected);
    assert.deepEqual(Object.keys(workload.castSetPolicy), [field]);
    const below = createPaladinHealingScenarioWorkload({
      ...ownedSet(setId, 4),
      scenarioId: "cast-procs-high",
    });
    assert.equal(below.castSetPolicy, undefined);
    assertPaladinAssignmentHealingJob({ ...request, workload });
  }
});

test("reactive-set fields respect separate threshold, shield and regeneration ownership", () => {
  for (const [setId, count] of [
    [162, 4],
    [163, 6],
  ]) {
    const frame = createPaladinHealingScenarioWorkload({
      ...ownedSet(setId, count),
      scenarioId: "self-before-no-trigger",
    });
    assert.equal(frame.selfSetPolicy.thresholdTiming, "before-hit");
    assert.equal(frame.selfSetPolicy.selfDamageTriggers, false);
    assert.equal(frame.selfSetPolicy.devoutProcChance, undefined);
    assert.equal(frame.selfSetPolicy.regenerationTickMs, undefined);
  }
  const shield = createPaladinHealingScenarioWorkload({
    ...ownedSet(182, 4),
    scenarioId: "self-before-no-trigger",
  });
  assert.deepEqual(shield.selfSetPolicy, { selfDamageTriggers: false, devoutProcChance: 0 });
  const regen = createPaladinHealingScenarioWorkload({
    ...ownedSet(189, 6),
    scenarioId: "self-before-no-trigger",
  });
  assert.deepEqual(regen.selfSetPolicy, { regenerationTickMs: 5000 });
});

test("item critical, cadence and area references require their actual supported owners", () => {
  for (const id of [4262, 7939, 8346])
    assert.equal(
      createPaladinHealingScenarioWorkload({ ...ownsItem(id), scenarioId: "item-critical-on" })
        .utilityHealingCanCrit,
      true,
    );
  assert.equal(
    createPaladinHealingScenarioWorkload({ ...ownsItem(11923), scenarioId: "item-critical-on" })
      .utilityHealingCanCrit,
    undefined,
  );
  for (const id of [4381, 18637])
    assert.equal(
      createPaladinHealingScenarioWorkload({ ...ownsItem(id), scenarioId: "item-critical-on" })
        .recombobulatorCanCrit,
      true,
    );
  assert.equal(
    createPaladinHealingScenarioWorkload({ ...ownsItem(11808), scenarioId: "item-critical-on" })
      .circleChannelScales,
    true,
  );
  assert.equal(
    createPaladinHealingScenarioWorkload({
      ...ownsItem(2816),
      scenarioId: "regeneration-five-seconds",
    }).itemHealthRegenTickMs,
    5000,
  );
  for (const id of [18472, 20512])
    assert.equal(
      createPaladinHealingScenarioWorkload({ ...ownsItem(id), scenarioId: "haunted-area" })
        .itemArea,
      "haunted",
    );
  assert.equal(
    createPaladinHealingScenarioWorkload({ ...ownsItem(249473), scenarioId: "heart-two-percent" })
      .itemEffectsPolicy.dormantHeartProcChance,
    0.02,
  );
});
