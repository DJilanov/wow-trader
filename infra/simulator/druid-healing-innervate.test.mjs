import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractDruidHealingInnervate,
  renderDruidHealingInnervate,
} from "./druid-healing-innervate.mjs";

const evidence = JSON.parse(
  gunzipSync(
    await readFile(new URL("./fixtures/druid-innervate-source.v1.json.gz", import.meta.url)),
  ),
);

test("owned Innervate retains authenticated current durations, mana and regen", () => {
  const rules = extractDruidHealingInnervate(evidence);
  assert.equal(rules.durationMs, 20000);
  assert.equal(rules.cooldownMs, 360000);
  assert.equal(rules.baseManaFraction, 0.05);
  assert.equal(rules.spiritRegenerationBonus, 4);
  assert.equal(rules.externalCastsGranted, 0);
  assert.equal(rules.trainingVerified, false);
});

test("unknown mana, duration or regeneration does not inherit Classic silently", () => {
  for (const [table, field, value] of [
    ["SpellPower", "PowerCostPct", 0],
    ["SpellDuration", "Duration", 10000],
    ["SpellEffect", "EffectBasePointsF", 999],
  ]) {
    const changed = structuredClone(evidence);
    changed.tables[table][0][field] = value;
    assert.throws(() => extractDruidHealingInnervate(changed));
  }
});

test("rendered policy requires a real self-cast and does not grant automatic cooldowns", () => {
  const rules = extractDruidHealingInnervate(evidence);
  const source = renderDruidHealingInnervate("\tresto.Druid.Initialize()\n", rules);
  assert(source.includes("target == &resto.Unit"));
  assert(source.includes("!target.HasActiveAuraWithTag"));
  assert(!source.includes("AddMajorCooldown"));
  assert.throws(() => renderDruidHealingInnervate("", rules));
});
