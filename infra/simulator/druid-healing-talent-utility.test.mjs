import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { druidHealingTalentSeeds } from "./druid-healing-study.mjs";
import { deriveDruidHealingUtilityTalents } from "./druid-healing-talent-utility.mjs";
import { talentsFromFields, decodeTalents, talentProblem } from "./talent-search.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-healing-study-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "0cb33bc5759f95fedac345a808fad7249b9ee1f5851cff5b9cd56da6b44e2e31",
);
const { trees } = JSON.parse(gunzipSync(bytes)),
  seeds = druidHealingTalentSeeds(trees);

test("a stray Ferocity point becomes healer utility without changing modeled healing talents", () => {
  const fields = { ...seeds[0].fields, moonglow: 2, ferocity: 1 },
    input = { ...seeds[0], fields, talentsString: talentsFromFields(trees, fields) },
    before = JSON.stringify(input),
    result = deriveDruidHealingUtilityTalents(trees, input);
  assert(result.changed);
  assert.equal(result.state.fields.ferocity, 0);
  assert(result.state.fields.subtlety > 0);
  for (const field of [
    "naturalist",
    "naturesFocus",
    "giftOfNature",
    "livingSpirit",
    "reflection",
    "heartOfTheWild",
    "genesis",
    "naturesMajesty",
    "improvedRegrowth",
    "wildGrowth",
    "swiftmend",
    "naturesSwiftness",
  ])
    assert.equal(result.state.fields[field] ?? 0, input.fields[field] ?? 0, field);
  assert.equal(JSON.stringify(input), before);
});

test("all archetypes keep legal 51-point trees, capstones and required filler gates", () => {
  for (const seed of seeds) {
    const result = deriveDruidHealingUtilityTalents(trees, seed);
    for (const state of [
      result.state,
      ...result.moves.map((move) => ({ talentsString: move.after })),
    ]) {
      const points = decodeTalents(trees, state.talentsString);
      assert.equal(talentProblem(trees, points), "");
      assert.equal(
        points.flat().reduce((sum, value) => sum + value, 0),
        51,
      );
    }
    assert.equal(result.state.fields.naturesGrace ?? 0, seed.fields.naturesGrace ?? 0);
    assert.equal(result.state.fields.wildGrowth ?? 0, seed.fields.wildGrowth ?? 0);
    assert.equal(result.state.fields.naturesSplendor ?? 0, seed.fields.naturesSplendor ?? 0);
    assert.equal(deriveDruidHealingUtilityTalents(trees, result.state).changed, false);
  }
});
