import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinHealingPassives,
  renderPaladinHealingPassives,
} from "./paladin-healing-passives.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-healing-passives-source.v1.json.gz", import.meta.url)),
  ),
);

test("uses the actual ranked curves and separates Illumination chance from its fixed refund", () => {
  const result = extractPaladinHealingPassives(source);
  assert.equal(result.sourceBuild, 70532);
  assert.deepEqual(result.talents.healingLight.values, [0, 4, 8, 12]);
  assert.deepEqual(result.talents.holyPower.values, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(result.talents.holyPowerSpecial.values, [0, 3, 6, 9, 12, 15]);
  assert.deepEqual(result.talents.illumination.values, [0, 20, 40, 60, 80, 100]);
  assert.equal(result.illuminationRefundFraction, 0.5);
  assert.equal(result.illuminationCostRule, "base-cost-before-modifiers");
  assert.equal(result.classMechanicsAdmission, false);
  assert.equal(result.startsNewClassClock, false);
  assert.equal(result.publicationAllowed, false);
});

test("rejects missing, duplicate or unsupported curve evidence and unverified descriptions", () => {
  for (const change of [
    (data) => data.lookupTables.CurvePoint.pop(),
    (data) => data.lookupTables.CurvePoint.push(data.lookupTables.CurvePoint[0]),
    (data) => {
      data.lookupTables.Curve[0].Type = 1;
    },
    (data) => {
      data.lookupTables.TraitDefinitionEffectPoints[0].OperationType = 1;
    },
    (data) => {
      data.classTalents.find((row) => row.spellId === 20210).ranks[0].text =
        "20% chance to refund 100% of the base cost";
    },
    (data) => {
      data.rawTables.SpellEffect.find(
        (row) => row.SpellID === 20210 && row.EffectIndex === 2,
      ).EffectBasePointsF = 100;
    },
  ]) {
    const data = structuredClone(source);
    change(data);
    assert.throws(() => extractPaladinHealingPassives(data));
  }
});

test("renders source-backed passive arrays without modifying evidence", () => {
  const before = JSON.stringify(source),
    passives = extractPaladinHealingPassives(source),
    implementation = readFileSync(
      new URL("./paladin-healing-passives.go", import.meta.url),
      "utf8",
    ),
    result = renderPaladinHealingPassives({ implementation, passives });
  assert(result.includes("[]float64{0,0.2,0.4,0.6,0.8,1}"));
  assert(result.includes("const kfcPaladinIlluminationRefund = 0.5"));
  assert.equal(JSON.stringify(source), before);
  assert.throws(() => renderPaladinHealingPassives({ implementation: "package holy", passives }));
});
