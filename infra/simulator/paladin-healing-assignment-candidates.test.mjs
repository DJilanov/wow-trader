import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
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
} from "./paladin-healing-talents.mjs";
import { paladinHealingPriorityCandidates } from "./paladin-healing-feedback-v2.mjs";
import { paladinHealingAssignmentRankCandidates } from "./paladin-healing-assignment-candidates.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("fixtures/" + name, import.meta.url))));
const books = fixture("healer-spell-eligibility-source.v1.json.gz");
const spellPolicy = createPaladinHealingSpellPolicy({
  baseline: fixture("paladin-baseline-source.v1.json.gz"),
  actives: fixture("paladin-healing-actives-source.v1.json.gz"),
  books: linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(books.atlas.source),
    tables: new Map(Object.entries(books.tables)),
    source: books.source,
  }),
});
const seeds = paladinHealingTalentSeeds(
  extractPaladinHealingTalentDomain(fixture("paladin-healing-talents-source.v1.json.gz")),
);
const gear = fixture("paladin-healing-gear-bank-source.v1.json.gz").seed;
function base(state) {
  return {
    state,
    gear,
    policy: paladinHealingPriorityCandidates(spellPolicy, state.fields)[0],
    consumes: { flask: 2, food: 1, mainHandImbue: 20, defaultPotion: 5, defaultConjured: 2 },
    manaRegenElixir: 2,
    requireVigil: false,
    minimumPartyTargets: 0,
    minimumPartyMissingHealth: 0,
  };
}

test("every admitted direct rank and the unchanged full option remain in both role searches", () => {
  for (const state of seeds)
    for (const kind of ["tank", "group"]) {
      const option = base(state),
        before = structuredClone(option),
        rows = [...paladinHealingAssignmentRankCandidates({ option, kind, spellPolicy })];
      assert.deepEqual(rows[0], option);
      assert.deepEqual(option, before);
      const ranks = eligiblePaladinHealingRanks(spellPolicy, {
        level: 60,
        talents: {
          holyShock: Boolean(state.fields.holyShock),
          lightsVigil: Boolean(state.fields.lightsVigil),
        },
        allowConditionalCandidates: true,
      }).filter((row) => ["holy-light", "flash-of-light"].includes(row.family));
      assert.deepEqual(
        new Set(rows.map((row) => row.policy.directSpellId)),
        new Set(ranks.map((row) => row.spellId)),
      );
      for (const row of rows) {
        assert.deepEqual(row.gear, gear);
        assert.deepEqual(row.state, state);
        assert.deepEqual(row.consumes, option.consumes);
        assert(!row.survivalPolicyId || !row.tankReservePolicyId);
      }
    }
});
test("Vigil plans include a legal low-rank pair without granting either talent to other builds", () => {
  for (const state of seeds) {
    const rows = [
      ...paladinHealingAssignmentRankCandidates({
        option: base(state),
        kind: "group",
        spellPolicy,
      }),
    ];
    if (state.fields.lightsVigil)
      assert(
        rows.some(
          (row) =>
            row.policy.ranks?.["holy-shock"] === 1311606 &&
            row.policy.ranks?.["lights-vigil"] === 1310911,
        ),
      );
    else assert(rows.every((row) => !row.policy.lightsVigil));
  }
});
test("resource proposals clear incompatible inherited policy families and retain ownership inputs", () => {
  const option = {
    ...base(seeds[0]),
    survivalPolicyId: "earlier-resources",
  };
  const rows = [...paladinHealingAssignmentRankCandidates({ option, kind: "tank", spellPolicy })];
  for (const row of rows.filter((row) => row.tankReservePolicyId)) {
    assert.equal(row.survivalPolicyId, undefined);
    assert.equal(row.reservePolicyId, undefined);
    assert.deepEqual(row.consumes, option.consumes);
  }
  assert.throws(() => [
    ...paladinHealingAssignmentRankCandidates({ option, kind: "burst", spellPolicy }),
  ]);
  assert.throws(() => [
    ...paladinHealingAssignmentRankCandidates({
      option: { ...option, reservePolicyId: "resource-window" },
      kind: "tank",
      spellPolicy,
    }),
  ]);
});
