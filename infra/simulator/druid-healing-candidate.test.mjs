import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { createDruidHealingCandidateWorkload } from "./druid-healing-candidate.mjs";
import { druidHealingTalentSeeds } from "./druid-healing-study.mjs";
import { createDruidHealingSpellPolicy } from "./druid-healing-spell-policy.mjs";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import { druidHealingResearchPolicies } from "./druid-healing-research.mjs";
import { druidWildheartEquipmentPolicies } from "./druid-wildheart-model.mjs";
import { druidItemResourcePolicies } from "./druid-item-resources.mjs";
import { druidLegacyItemPolicies } from "./druid-legacy-items.mjs";

function fixture(name, hash) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  return JSON.parse(gunzipSync(bytes));
}
const source = fixture(
    "druid-healing-study-source.v1.json.gz",
    "0cb33bc5759f95fedac345a808fad7249b9ee1f5851cff5b9cd56da6b44e2e31",
  ),
  client = fixture(
    "druid-client-healing-source.v1.json.gz",
    "e3912ed6cbd434dfd20181758ed331ea0c93f3c81c85329f77ca31e601ae3c22",
  ),
  books = fixture(
    "healer-spell-eligibility-source.v1.json.gz",
    "f8ddd54bfe89b584669c3670b545e5caf7643d266506067ab783febc775ff5db",
  ),
  spellPolicy = createDruidHealingSpellPolicy(
    client,
    linkClientRaidSpellBooks({
      reference: extractClassicRaidSpellBooks(books.atlas.source),
      tables: new Map(Object.entries(books.tables)),
      source: books.source,
    }),
  ),
  input = {
    kind: "group",
    pressure: 800,
    durationSeconds: 180,
    state: druidHealingTalentSeeds(source.trees)[0],
    policy: { directSpellId: 9889, rejuvenation: true, wildGrowth: true, ranks: {} },
    gear: { items: Array.from({ length: 17 }, () => ({ id: 0 })) },
    consumes: { defaultConjured: 0 },
    hypothesis: {
      research: druidHealingResearchPolicies()[0],
      equipmentPolicy: druidWildheartEquipmentPolicies()[0],
      itemEffectsPolicy: druidItemResourcePolicies()[0],
      legacyItemsPolicy: druidLegacyItemPolicies()[1],
    },
    spellPolicy,
  };

test("finalist assignment preserves fixed pressure, duration and all four target schedules", () => {
  const frame = createDruidHealingCandidateWorkload(input);
  assert.equal(frame.name, "synthetic-group-180s-800dps");
  assert.equal(frame.damage.length, 179 * 4);
  assert.equal(
    frame.damage.reduce((sum, row) => sum + row.amount, 0),
    179 * 800,
  );
  assert(
    frame.damage.every((row) => row.amount === 200 && row.raidIndex >= 1 && row.raidIndex <= 4),
  );
  assert.deepEqual(frame.cooldowns, [
    { itemId: 13444, minimumMissingMana: 3000, requireHealingDemand: true },
  ]);
});

test("item activation requires ownership and duplicate equipped Mindtaps get one selector", () => {
  const gear = structuredClone(input.gear);
  [11819, 18371, 18371, 272439, 13143].forEach((id, i) => {
    gear.items[i] = { id };
  });
  const frame = createDruidHealingCandidateWorkload({ ...input, gear });
  assert.deepEqual(frame.cooldowns.slice(1), [
    { spellId: 15604, minimumMissingMana: 630, requireHealingDemand: true },
    { spellId: 1302205, minimumMissingMana: 1250, requireHealingDemand: true },
    { itemId: 272439, requireHealingDemand: true },
    { spellId: 17252, minimumMissingMana: 22, requireHealingDemand: true },
  ]);
});

test("mana rune activation is explicit and does not introduce external cooldowns", () => {
  const frame = createDruidHealingCandidateWorkload({ ...input, consumes: { defaultConjured: 2 } });
  assert.deepEqual(frame.cooldowns.at(-1), {
    itemId: 12662,
    minimumMissingMana: 1500,
    requireHealingDemand: true,
  });
  assert.equal(frame.cooldowns.length, 2);
  assert.equal(frame.innervateMinimumMissingMana, 2500);
});

test("spread and five-minute assignments retain their declared target geometry", () => {
  const frame = createDruidHealingCandidateWorkload({
    ...input,
    durationSeconds: 300,
    spread: true,
  });
  assert.equal(frame.name, "synthetic-group-300s-800dps-spread");
  assert.equal(frame.damage.length, 299 * 4);
  assert.deepEqual(
    frame.targets.map((target) => target.x),
    [0, 12, 24, 36, 48],
  );
});

test("hypotheses remain explicit and owned without changing the caller's declaration", () => {
  const before = JSON.stringify(input),
    healingPolicy = { WildGrowthDecay: 0.2, SwiftmendSelection: "largest" },
    frame = createDruidHealingCandidateWorkload({
      ...input,
      hypothesis: { ...input.hypothesis, healingPolicy },
    });
  assert.deepEqual(frame.healingPolicy, healingPolicy);
  frame.research.omenProcChance = 0;
  frame.healingPolicy.WildGrowthDecay = 0.05;
  assert.equal(JSON.stringify(input), before);
  assert.equal(healingPolicy.WildGrowthDecay, 0.2);
  for (const key of Object.keys(input.hypothesis)) {
    const hypothesis = { ...input.hypothesis };
    delete hypothesis[key];
    assert.throws(
      () => createDruidHealingCandidateWorkload({ ...input, hypothesis }),
      /Missing declared/,
    );
  }
});
