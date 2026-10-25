import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { extractDruidUtilityItemRules } from "./druid-utility-items.mjs";
const bytes = readFileSync(
  new URL("./fixtures/druid-utility-items-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "4bd0f8428d8f2ddfa22a3531b87f511c588455b0419085834e07164774b1c393",
);
const source = JSON.parse(gunzipSync(bytes));
test("source-backed utility amounts retain channel cost, shared cooldowns and correct ten charges", () => {
  const rules = extractDruidUtilityItemRules(source);
  assert.equal(rules.circle.ticks, 10);
  assert.equal(rules.circle.manaPerTick.mean * rules.circle.ticks, 790);
  assert.equal(rules.circle.healthPerTick.mean * rules.circle.ticks, 790);
  assert.equal(rules.gauntlets.heal.minimum, 300);
  assert.equal(rules.gauntlets.heal.maximum, 500);
  assert.equal(rules.recombobulator.charges, 10);
  assert.equal(rules.recombobulator.sharedCooldownMs, 120000);
  assert.equal(rules.recombobulator.mana.mean, 304);
  assert.equal(rules.recombobulator.heal.mean, 666);
});
test("party regeneration and unverified stacking cannot become a free confirmed raid buff", () => {
  const rules = extractDruidUtilityItemRules(source);
  assert.equal(rules.headmaster.intellect, 20);
  assert.equal(rules.headmaster.stacksWithArcaneIntellectVerified, false);
  assert.equal(rules.headmaster.target, "party-members");
  assert.equal(rules.baron.healthPerFiveSeconds, 4);
  assert.equal(rules.baron.classifiedAsRegeneration, true);
  assert.equal(rules.baron.healingPowerCoefficient, 0);
  assert.equal(rules.runtimeAdmission, false);
  assert.equal(rules.currentBaseStatsVerified, false);
});
test("missing effects, changed coefficients and unreviewed use quantities fail closed", () => {
  for (const mutate of [
    (s) => s.tables.SpellEffect.pop(),
    (s) => {
      s.tables.SpellEffect.find((row) => row.SpellID === 10577).EffectBonusCoefficient = 0.5;
    },
    (s) => {
      s.tables.ItemEffect.find((row) => row.SpellID === 23064).Charges = -5;
    },
    (s) => {
      s.tables.SpellEffect.find((row) => row.SpellID === 18264).EffectBasePointsF = 25;
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => extractDruidUtilityItemRules(changed));
  }
});
test("changed channel duration and radius require new model admission", () => {
  const duration = structuredClone(source);
  duration.tables.SpellDuration.find((row) => row.id === 1).Duration = 5000;
  assert.throws(() => extractDruidUtilityItemRules(duration));
  const radius = structuredClone(source);
  radius.tables.SpellRadius[0].Radius = 40;
  assert.throws(() => extractDruidUtilityItemRules(radius));
});
