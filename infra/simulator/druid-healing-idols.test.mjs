import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { extractDruidHealingIdols, applyDruidHealingIdols } from "./druid-healing-idols.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-healing-idol-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "7c3f710d2f09178531307eddf1fb6daf67b440fd5e0d1959d0b4e53b6e85917c",
);
const fixture = JSON.parse(gunzipSync(bytes));

test("current idols retain conditional initial healing, owned HoTs, static cooldown and existing Spirit", () => {
  const rules = extractDruidHealingIdols(fixture);
  assert.equal(rules.regrowth.multiplier, 1.05);
  assert.equal(rules.regrowth.component, "initial");
  assert.deepEqual(rules.synthesis.countedFamilies, ["rejuvenation", "regrowth", "wild-growth"]);
  assert.equal(rules.synthesis.millisecondsPerOwnedHotFamily, 1000);
  assert.equal(rules.swiftness.cooldownReductionMs, 3000);
  assert.equal(rules.spirit.multiplier, 1.05);
  assert.equal(rules.serverMechanicsVerified, false);
  assert.equal(rules.publicationAllowed, false);
});
test("changed effect identity, amount, extra effects or Classic descriptions are rejected", () => {
  for (const mutate of [
    (value) => {
      value.tables.ItemEffect[0].SpellID = 1;
    },
    (value) => {
      value.tables.SpellEffect[0].EffectBasePointsF = 50;
    },
    (value) => {
      value.tables.SpellEffect.push({ ...value.tables.SpellEffect[0], EffectIndex: 1 });
    },
    (value) => {
      value.tables.Spell.find((row) => row.id === 27853).Description_lang =
        "Increases Rejuvenation healing by 50.";
    },
  ]) {
    const changed = structuredClone(fixture);
    mutate(changed);
    assert.throws(() => extractDruidHealingIdols(changed));
  }
});
test("hooks change only the reviewed Resto call sites and reject duplicate application", () => {
  const source = {
    baseline:
      "prefix spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit) suffix",
    advanced:
      "config.Cast.CD = core.Cooldown{Timer: resto.NewTimer(), Duration: time.Duration(rank.CooldownMs) * time.Millisecond}\nspell.CalcAndDealHealing(sim, target, amount/spell.CasterHealingMultiplier(), spell.OutcomeHealingCrit)",
  };
  const result = applyDruidHealingIdols(source);
  assert(result.baseline.includes("kfcIdolDirectHealing"));
  assert(result.advanced.includes("kfcIdolSwiftCooldown"));
  assert(result.advanced.includes("kfcIdolSwiftReduction"));
  assert(!result.baseline.includes("MultiplyStat"));
  assert.throws(() => applyDruidHealingIdols(result));
  assert.throws(() =>
    applyDruidHealingIdols({ ...source, advanced: source.advanced + source.advanced }),
  );
});
