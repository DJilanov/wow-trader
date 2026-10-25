import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinHealingInstantCosts,
  renderPaladinHealingInstantCosts,
} from "./paladin-healing-instant-costs.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/paladin-healing-instant-costs-source.v1.json.gz", import.meta.url),
    ),
  ),
);

test("resolves the five ranked discounts onto four mask-matched instant Shock ranks", () => {
  const result = extractPaladinHealingInstantCosts(source);
  assert.deepEqual(result.reductionsPercent, [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(result.affectedSpellIds, [20473, 20929, 20930, 1311606]);
  assert.equal(result.ranks.find((row) => row.spellId === 20216).applies, false);
  assert.equal(result.ranks.find((row) => row.spellId === 19943).applies, false);
  assert.equal(result.ranks.find((row) => row.spellId === 1311595).applies, false);
  assert.equal(result.classMechanicsAdmission, false);
  assert.equal(result.publicationAllowed, false);
});

test("fails closed on altered curves, duplicate roots and unsupported family scope", () => {
  for (const change of [
    (data) => {
      data.curvePoints[0].Pos[1] = -3;
    },
    (data) => {
      data.effects[0].EffectMiscValue[0] = 0;
    },
    (data) => {
      data.ranks.push(data.ranks[0]);
    },
    (data) => {
      data.ranks.find((row) => row.spellId === 20216).mask = [2097152, 0, 0, 0];
    },
    (data) => {
      data.ranks.find((row) => row.spellId === 20930).castMs = 1500;
    },
  ]) {
    const data = structuredClone(source);
    change(data);
    assert.throws(() => extractPaladinHealingInstantCosts(data));
  }
});

test("renders bounded discount controls without changing the evidence", () => {
  const before = JSON.stringify(source),
    costs = extractPaladinHealingInstantCosts(source),
    implementation = readFileSync(
      new URL("./paladin-healing-instant-costs.go", import.meta.url),
      "utf8",
    ),
    rendered = renderPaladinHealingInstantCosts({ implementation, costs });
  assert(rendered.includes("[]int32{0,2,4,6,8,10}"));
  assert(!rendered.includes("// KFC_PALADIN_INSTANT_COST_VALUES"));
  assert.equal(JSON.stringify(source), before);
  assert.throws(() => renderPaladinHealingInstantCosts({ implementation: "package holy", costs }));
});
