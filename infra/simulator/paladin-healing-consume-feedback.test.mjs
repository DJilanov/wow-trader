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
} from "./paladin-healing-talents.mjs";
import { assertPaladinAssignmentHealingJob } from "./paladin-assignment-protocol.mjs";
import {
  paladinHealingFeedbackHypotheses,
  paladinHealingPriorityCandidates,
} from "./paladin-healing-feedback.mjs";
import {
  createPaladinHealingConsumeWorkload,
  paladinHealingConsumeCandidates,
} from "./paladin-healing-consume-feedback.mjs";

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

test("Paladin consume feedback covers supported references and excludes raid-only choices", () => {
  const rows = [...paladinHealingConsumeCandidates()];
  assert.equal(rows.length, 1320);
  assert.equal(new Set(rows.map((row) => JSON.stringify(row))).size, rows.length);
  assert(
    rows.every(
      (row) =>
        row.consumes.food !== 5 &&
        ![1, 2].includes(row.consumes.mainHandImbue) &&
        row.manaRegenElixir !== 1,
    ),
  );
  assert(
    rows.some(
      (row) =>
        Object.values(row.consumes).every((value) => value === 0) && row.manaRegenElixir === 0,
    ),
  );
  for (const row of rows)
    assertPaladinAssignmentHealingJob({
      ...request,
      workload: createPaladinHealingConsumeWorkload(
        { ...input, hypothesis: paladinHealingFeedbackHypotheses()[0] },
        row,
      ),
    });
});

test("resource actions follow actual potion and rune selection while owned item actions remain", () => {
  const rows = [...paladinHealingConsumeCandidates()],
    hypothesis = paladinHealingFeedbackHypotheses()[0];
  for (const defaultPotion of [0, 5])
    for (const defaultConjured of [0, 2]) {
      const choice = rows.find(
          (row) =>
            row.consumes.defaultPotion === defaultPotion &&
            row.consumes.defaultConjured === defaultConjured,
        ),
        frame = createPaladinHealingConsumeWorkload({ ...input, hypothesis }, choice);
      assert.equal(
        frame.cooldowns.some((row) => row.itemId === 13444),
        defaultPotion === 5,
      );
      assert.equal(
        frame.cooldowns.some((row) => row.itemId === 12662),
        defaultConjured === 2,
      );
      assert(frame.cooldowns.some((row) => row.spellId === 15604));
      assert.equal(choice.consumes.defaultPotion, defaultPotion);
    }
});

test("unknown or raid-locked consume fields fail rather than becoming free cooldowns", () => {
  const choice = [...paladinHealingConsumeCandidates()][0],
    hypothesis = paladinHealingFeedbackHypotheses()[0];
  for (const changed of [
    { ...choice, manaRegenElixir: 1 },
    { ...choice, consumes: { ...choice.consumes, food: 5 } },
    { ...choice, consumes: { ...choice.consumes, mainHandImbue: 1 } },
    { ...choice, consumes: { ...choice.consumes, unknown: 1 } },
  ])
    assert.throws(() => createPaladinHealingConsumeWorkload({ ...input, hypothesis }, changed));
});
