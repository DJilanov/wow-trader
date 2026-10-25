import assert from "node:assert/strict";
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
  paladinHealingTalentNeighbors,
} from "./paladin-healing-talents.mjs";
import {
  paladinHealingFeedbackHypotheses,
  paladinHealingPriorityCandidates,
} from "./paladin-healing-feedback-v2.mjs";
import { createPaladinHealingOptionWorkload } from "./paladin-healing-option-workload.mjs";
import { assertPaladinAssignmentHealingJob } from "./paladin-assignment-protocol.mjs";

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
  domain = extractPaladinHealingTalentDomain(fixture("paladin-healing-talents-source.v1.json.gz")),
  seed = paladinHealingTalentSeeds(domain)[0],
  source = fixture("paladin-healing-gear-bank-source.v1.json.gz"),
  items = new Map(source.items.map((row) => [row.id, row])),
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
  input = { option, kind: "group", spellPolicy, items };

test("selected plans retain their owned ranks and resource choices across assignment changes", () => {
  const before = structuredClone(option);
  for (const durationSeconds of [180, 300])
    for (const damagePerSecond of [400, 600, 1200])
      for (const hypothesis of paladinHealingFeedbackHypotheses()) {
        const workload = createPaladinHealingOptionWorkload({
          ...input,
          durationSeconds,
          damagePerSecond,
          hypothesis,
        });
        assertPaladinAssignmentHealingJob({ ...request, workload });
        assert.equal(workload.assignmentScoring, "external-demand-v1");
        assert(workload.name.includes(`-${durationSeconds}s-`));
        assert.equal(workload.useDivineFavor, Boolean(seed.fields.divineFavor));
        assert(workload.cooldowns.some((row) => row.itemId === 13444));
        assert(workload.cooldowns.some((row) => row.itemId === 12662));
        assert.equal(
          workload.priorities.find((row) => row.requireVigil !== undefined).requireVigil,
          false,
        );
      }
  assert.deepEqual(option, before);
});

test("coarse cooldown and group-demand controls survive reconstruction without extra item uses", () => {
  const controls = {
      ...option,
      requireVigil: true,
      minimumPartyTargets: 4,
      minimumPartyMissingHealth: 4800,
      favorMinimumBaseCost: 0,
      resourceOrder: "rune-last",
    },
    workload = createPaladinHealingOptionWorkload({
      ...input,
      option: controls,
      durationSeconds: 180,
      damagePerSecond: 600,
      hypothesis: paladinHealingFeedbackHypotheses()[0],
    }),
    family = (name) =>
      workload.priorities.find(
        (row) => spellPolicy.ranks.find((rank) => rank.spellId === row.spellId).family === name,
      );
  assert.equal(family("holy-shock").requireVigil, true);
  assert.equal(family("lights-vigil").minimumPartyTargets, 4);
  assert.equal(family("lights-vigil").minimumPartyMissingHealth, 4800);
  assert.equal(workload.divineFavorMinimumBaseCost, 0);
  assert.equal(workload.cooldowns.at(-1).itemId, 12662);
  assert.equal(
    new Set(workload.cooldowns.map((row) => row.itemId ?? row.spellId)).size,
    workload.cooldowns.length,
  );
  assertPaladinAssignmentHealingJob({ ...request, workload });
});

test("a legal no-Favor build cannot regain the removed cooldown during pressure adaptation", () => {
  const neighbor = paladinHealingTalentNeighbors(domain, seed.talentsString).find(
    (row) => !row.fields.divineFavor,
  );
  assert(neighbor);
  const workload = createPaladinHealingOptionWorkload({
    ...input,
    option: { ...option, state: neighbor },
    durationSeconds: 180,
    damagePerSecond: 600,
    hypothesis: paladinHealingFeedbackHypotheses()[0],
  });
  assert.equal(workload.useDivineFavor, false);
  assert.equal(workload.divineFavorMinimumBaseCost, 0);
  assertPaladinAssignmentHealingJob({ ...request, workload });
});

test("invalid controls and unowned marked Shock plans fail before simulation", () => {
  for (const change of [
    { minimumPartyTargets: -1 },
    { minimumPartyMissingHealth: -1 },
    { favorMinimumBaseCost: NaN },
    { useUtilities: undefined },
    { resourceOrder: "extra-rune" },
    { requireVigil: true, policy: { ...option.policy, lightsVigil: false } },
  ])
    assert.throws(() =>
      createPaladinHealingOptionWorkload({
        ...input,
        option: { ...option, ...change },
        durationSeconds: 180,
        damagePerSecond: 600,
        hypothesis: paladinHealingFeedbackHypotheses()[0],
      }),
    );
});
