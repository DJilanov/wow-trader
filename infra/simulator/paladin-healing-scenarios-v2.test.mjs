import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import {
  createPaladinHealingLegacyScenarioWorkload,
  paladinHealingLegacyScenarios,
} from "./paladin-healing-scenarios-v2.mjs";
import { createPaladinHealingScenarioWorkload } from "./paladin-healing-scenarios.mjs";
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
import { assertPaladinLegacyHealingJob } from "./paladin-legacy-protocol.mjs";

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
    [
      ...source.items,
      ...setSource.items,
      ...extraItems.items,
      ...fixture("paladin-legacy-item-parent.v1.json.gz").evidence.compiled,
    ].map((row) => [row.id, row]),
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

test("Paladin legacy matrix retains all original cases and separates conditional environments", () => {
  const values = paladinHealingLegacyScenarios();
  assert.equal(values.length, 28);
  assert.equal(values.filter((entry) => entry.kind === "comparison").length, 24);
  assert.equal(values.filter((entry) => entry.kind === "conditional").length, 4);
  assert.equal(new Set(values.map((entry) => entry.id)).size, values.length);
  values[0].label = "changed";
  assert.notEqual(paladinHealingLegacyScenarios()[0].label, "changed");
});

test("Paladin legacy policy constructor adds only actual owned item references", () => {
  const before = structuredClone(input.option);
  for (const owned of [[], [12930], [18472], [12930, 18472]]) {
    const gear = structuredClone(input.option.gear);
    gear.items[12] = { id: owned[0] ?? 0 };
    gear.items[13] = { id: owned[1] ?? 0 };
    const scenarioInput = { ...input, option: { ...input.option, gear } };
    for (const scenario of paladinHealingLegacyScenarios()) {
      const workload = createPaladinHealingLegacyScenarioWorkload({
        ...scenarioInput,
        scenarioId: scenario.id,
      });
      assertPaladinLegacyHealingJob({ ...request, workload });
      if (!owned.length) {
        assert.equal(workload.legacyItemsPolicy, undefined);
        continue;
      }
      const policy = workload.legacyItemsPolicy;
      assert(policy);
      assert.equal(
        policy.briarwoodSpellPower,
        owned.includes(12930) ? (scenario.briarwoodSpellPower ?? 15) : undefined,
      );
      assert.equal(
        policy.royalSealHealingPower,
        owned.includes(18472) ? (scenario.royalSealHealingPower ?? 22) : undefined,
      );
      const original = createPaladinHealingScenarioWorkload({
        ...scenarioInput,
        scenarioId: scenario.legacyBase,
      });
      const withoutLegacy = { ...workload };
      delete withoutLegacy.legacyItemsPolicy;
      assert.deepEqual(withoutLegacy, original);
    }
  }
  assert.deepEqual(input.option, before);
  assert.throws(() =>
    createPaladinHealingLegacyScenarioWorkload({ ...input, scenarioId: "invented" }),
  );
});

test("current neutral, historical and Marsh hypotheses remain independent of Haunted mana", () => {
  const gear = structuredClone(option.gear);
  gear.items[12] = { id: 12930 };
  gear.items[13] = { id: 18472 };
  const owned = { ...input, option: { ...option, gear } };
  const current = createPaladinHealingLegacyScenarioWorkload({ ...owned, scenarioId: "reference" }),
    historic = createPaladinHealingLegacyScenarioWorkload({
      ...owned,
      scenarioId: "legacy-historical-briarwood",
    }),
    marsh = createPaladinHealingLegacyScenarioWorkload({
      ...owned,
      scenarioId: "briarwood-marsh-area",
    }),
    haunted = createPaladinHealingLegacyScenarioWorkload({ ...owned, scenarioId: "haunted-area" }),
    conservative = createPaladinHealingLegacyScenarioWorkload({
      ...owned,
      scenarioId: "combined-conservative-no-retained-seal-healing",
    });
  assert.equal(current.legacyItemsPolicy.briarwoodSpellPower, 15);
  assert.equal(historic.legacyItemsPolicy.briarwoodSpellPower, 29);
  assert.equal(marsh.legacyItemsPolicy.briarwoodSpellPower, 30);
  assert.equal(haunted.legacyItemsPolicy.briarwoodSpellPower, 15);
  assert.equal(haunted.itemArea, "haunted");
  assert.equal(marsh.itemArea ?? "neutral", "neutral");
  assert.equal(conservative.legacyItemsPolicy.royalSealHealingPower, 0);
  assert.equal(conservative.vigilRefundMode, "none");
  assert.equal(conservative.rankScaling.fullScalingGap, 5);
});
