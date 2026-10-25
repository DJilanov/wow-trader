import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { createDruidHealingScenarioWorkload } from "./druid-healing-scenarios.mjs";
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

function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum);
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

test("every duration and assignment uses the same 400-DPS baseline as Priest", () => {
  for (const durationSeconds of [180, 300])
    for (const kind of ["tank", "group", "burst"]) {
      const frame = createDruidHealingScenarioWorkload(input, {
        kind,
        durationSeconds,
        layout: "stacked",
      });
      assert.equal(frame.name, `synthetic-${kind}-${durationSeconds}s-400dps`);
      assert.deepEqual(frame.targets.map((target) => target.x), [0, 2, 4, 6, 8]);
      assert(frame.damage.every((row) => row.atMs < durationSeconds * 1000 && row.raidIndex !== 0));
      if (kind === "tank" || kind === "group")
        assert.equal(
          frame.damage.reduce((sum, row) => sum + row.amount, 0),
          (durationSeconds - 1) * 400,
        );
    }
});

test("spread scenarios stay within 30 yards and preserve damage, priorities and owned cooldowns", () => {
  const before = JSON.stringify(input),
    variant = { kind: "group", durationSeconds: 300, layout: "stacked" },
    stacked = createDruidHealingScenarioWorkload(input, variant),
    spread = createDruidHealingScenarioWorkload(input, { ...variant, layout: "spread" });
  assert.deepEqual(
    spread.targets.map((target) => target.x),
    [0, 12, 18, 24, 30],
  );
  assert.equal(spread.name, stacked.name + "-spread");
  assert.deepEqual(spread.damage, stacked.damage);
  assert.deepEqual(spread.priorities, stacked.priorities);
  assert.deepEqual(spread.cooldowns, stacked.cooldowns);
  assert.equal(JSON.stringify(input), before);
});

test("unreviewed layouts and durations are rejected", () => {
  for (const variant of [
    { kind: "group", durationSeconds: 60, layout: "stacked" },
    { kind: "group", durationSeconds: 300, layout: "unknown" },
  ])
    assert.throws(() => createDruidHealingScenarioWorkload(input, variant));
});
