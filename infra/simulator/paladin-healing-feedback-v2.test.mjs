import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { extractDormantHeartFamily } from "./dormant-heart-family.mjs";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  createPaladinHealingSpellPolicy,
  eligiblePaladinHealingRanks,
} from "./paladin-healing-eligibility.mjs";
import {
  extractPaladinHealingTalentDomain,
  paladinHealingTalentSeeds,
  paladinHealingTalentNeighbors,
} from "./paladin-healing-talents.mjs";
import { assertPaladinAssignmentHealingJob } from "./paladin-assignment-protocol.mjs";
import {
  createPaladinHealingFeedbackWorkload,
  paladinHealingFeedbackHypotheses,
  paladinHealingPriorityCandidates,
  paladinHealingSupportRankNeighbors,
  paladinHealingCompatiblePriority,
} from "./paladin-healing-feedback-v2.mjs";

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
  seeds = paladinHealingTalentSeeds(
    extractPaladinHealingTalentDomain(fixture("paladin-healing-talents-source.v1.json.gz")),
  ),
  source = fixture("paladin-healing-gear-bank-source.v1.json.gz"),
  sets = fixture("paladin-healing-sets-source.v1.json.gz"),
  items = new Map([...source.items, ...sets.items].map((row) => [row.id, row])),
  request = JSON.parse(
    readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
  ).request;
const input = {
  kind: "group",
  durationSeconds: 180,
  damagePerSecond: 400,
  fields: seeds[0].fields,
  spellPolicy,
  policy: paladinHealingPriorityCandidates(spellPolicy, seeds[0].fields)[0],
  gear: source.seed,
  items,
};

test("Paladin feedback retains all eligible direct ranks and rejects excluded raid-book ranks", () => {
  for (const seed of seeds) {
    const policies = paladinHealingPriorityCandidates(spellPolicy, seed.fields),
      ranks = eligiblePaladinHealingRanks(spellPolicy, {
        level: 60,
        talents: {
          holyShock: Boolean(seed.fields.holyShock),
          lightsVigil: Boolean(seed.fields.lightsVigil),
        },
        allowConditionalCandidates: true,
      }).filter((row) => ["holy-light", "flash-of-light"].includes(row.family));
    assert.deepEqual(
      new Set(policies.map((row) => row.directSpellId)),
      new Set(ranks.map((row) => row.spellId)),
    );
    assert.equal(new Set(policies.map((row) => JSON.stringify(row))).size, policies.length);
    assert(
      policies.every(
        (row) => row.directSpellId !== 25292 && (!row.lightsVigil || seed.fields.lightsVigil),
      ),
    );
    for (const policy of policies)
      for (const hypothesis of paladinHealingFeedbackHypotheses()) {
        const workload = createPaladinHealingFeedbackWorkload({
          ...input,
          fields: seed.fields,
          policy,
          hypothesis,
        });
        assertPaladinAssignmentHealingJob({ ...request, workload });
        assert.equal(workload.assignmentScoring, "external-demand-v1");
        assert.equal(workload.requireFullTalentBuild, true);
      }
  }
});

test("Paladin feedback references require actual owners and preserve explicit set thresholds", () => {
  for (const hypothesis of paladinHealingFeedbackHypotheses()) {
    const plain = createPaladinHealingFeedbackWorkload({ ...input, hypothesis });
    assert.equal(plain.castSetPolicy, undefined);
    assert.equal(plain.selfSetPolicy, undefined);
    assert.equal(plain.itemEffectsPolicy, undefined);
    assert(plain.cooldowns.some((row) => row.spellId === 15604));
    assert(!plain.cooldowns.some((row) => row.itemId === 20512 || row.spellId === 17252));
    const gear = structuredClone(source.seed);
    for (const row of sets.items
      .filter((row) => row.setId === 185)
      .sort((a, b) => a.id - b.id)
      .slice(0, 5))
      gear.items[row.type - 1] = { id: row.id };
    const active = createPaladinHealingFeedbackWorkload({ ...input, gear, hypothesis });
    assert.deepEqual(active.castSetPolicy, {
      wildheartManaChance: hypothesis.conservative ? 0 : 0.02,
    });
    assert.equal(active.selfSetPolicy, undefined);
    assertPaladinAssignmentHealingJob({ ...request, workload: active });
  }
});

test("Heart sensitivity binds the captured item identity and current literal reference", () => {
  const heart = extractDormantHeartFamily(fixture("dormant-heart-family-source.v1.json.gz")),
    gear = structuredClone(source.seed),
    ownedItems = new Map(items);
  gear.items[12] = { id: heart.itemId };
  ownedItems.set(heart.itemId, { id: heart.itemId });
  const [reference, stress] = paladinHealingFeedbackHypotheses();
  assert.equal(
    createPaladinHealingFeedbackWorkload({
      ...input,
      gear,
      items: ownedItems,
      hypothesis: reference,
    }).itemEffectsPolicy.dormantHeartProcChance,
    1,
  );
  assert.equal(
    createPaladinHealingFeedbackWorkload({ ...input, gear, items: ownedItems, hypothesis: stress })
      .itemEffectsPolicy.dormantHeartProcChance,
    0,
  );
  assert.throws(() =>
    createPaladinHealingFeedbackWorkload({
      ...input,
      hypothesis: { ...reference, heartChance: 2 },
    }),
  );
});

test("legal no-Favor talent neighbors cannot retain an inactive cooldown cost", () => {
  const domain = extractPaladinHealingTalentDomain(
      fixture("paladin-healing-talents-source.v1.json.gz"),
    ),
    neighbor = paladinHealingTalentNeighbors(domain, seeds[0].talentsString).find(
      (row) => !row.fields.divineFavor,
    );
  assert(neighbor);
  const result = createPaladinHealingFeedbackWorkload({
    ...input,
    fields: neighbor.fields,
    hypothesis: paladinHealingFeedbackHypotheses()[0],
  });
  assert.equal(result.useDivineFavor, false);
  assert.equal(result.divineFavorMinimumBaseCost, 0);
  assertPaladinAssignmentHealingJob({ ...request, workload: result });
});

test("active-heal feedback retains each eligible Shock and Vigil rank with ownership checks", () => {
  const policy = paladinHealingPriorityCandidates(spellPolicy, seeds[0].fields).find(
      (row) => row.lightsVigil,
    ),
    hypothesis = paladinHealingFeedbackHypotheses()[0],
    neighbors = paladinHealingSupportRankNeighbors(spellPolicy, seeds[0].fields, policy),
    families = new Map();
  for (const candidate of neighbors) {
    const frame = createPaladinHealingFeedbackWorkload({ ...input, policy: candidate, hypothesis });
    for (const row of frame.priorities.slice(0, -1)) {
      const family = spellPolicy.ranks.find((rank) => rank.spellId === row.spellId).family;
      if (!families.has(family)) families.set(family, new Set());
      families.get(family).add(row.spellId);
    }
  }
  for (const family of ["holy-shock", "lights-vigil"])
    assert.deepEqual(
      families.get(family),
      new Set(spellPolicy.ranks.filter((row) => row.family === family).map((row) => row.spellId)),
    );
  assert.throws(() =>
    createPaladinHealingFeedbackWorkload({
      ...input,
      policy: { ...policy, ranks: { "holy-shock": 25292 } },
      hypothesis,
    }),
  );
  assert.throws(() =>
    createPaladinHealingFeedbackWorkload({
      ...input,
      policy: { ...policy, holyShock: false, lightsVigil: false, ranks: { "holy-shock": 20930 } },
      hypothesis,
    }),
  );
});

test("talent ownership changes remove unavailable marks and ranks without changing the input", () => {
  const original = {
      ...paladinHealingPriorityCandidates(spellPolicy, seeds[0].fields).find(
        (row) => row.lightsVigil,
      ),
      ranks: { "holy-shock": 20930, "lights-vigil": 1311595 },
    },
    before = structuredClone(original),
    next = paladinHealingCompatiblePriority(spellPolicy, {}, original);
  assert.deepEqual(original, before);
  assert.equal(next.holyShock, false);
  assert.equal(next.lightsVigil, false);
  assert.equal(next.maintainVigil, false);
  assert.deepEqual(next.ranks, {});
});
