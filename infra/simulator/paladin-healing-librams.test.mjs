import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinHealingLibrams,
  renderPaladinHealingLibrams,
} from "./paladin-healing-librams.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-healing-librams-source.v1.json.gz", import.meta.url)),
  ),
);

test("all eleven librams retain exact links and healing-controller scope", () => {
  const rules = extractPaladinHealingLibrams(fixture);
  assert.deepEqual(
    rules.items.filter((row) => row.activeInHealingController).map((row) => row.id),
    [228175, 272436, 279248],
  );
  assert.equal(rules.economy.manaReductionPercent, 5);
  assert.equal(rules.economy.refundBasis, "original-spell-base-cost");
  assert.deepEqual(rules.holyLightIds, [635, 639, 647, 1026, 1042, 3472, 10328, 10329, 25292]);
  assert.equal(rules.alacrity.reductionMs, 200);
  assert.equal(rules.alacrity.durationMs, 10000);
  assert.equal(rules.alacrity.charges, 1);
  assert.equal(rules.infusion.registration, "existing-generic-paladin-item-effect");
  assert.equal(rules.serverMechanicsVerified, false);
  assert.equal(rules.publicationAllowed, false);
});

test("changed proc chance, charges, duration, scope or item link requires a new review", () => {
  for (const mutate of [
    (source) => {
      source.tables.SpellAuraOptions.find((row) => row.SpellID === 449980).ProcChance = 20;
    },
    (source) => {
      source.tables.SpellAuraOptions.find((row) => row.SpellID === 449982).ProcCharges = 2;
    },
    (source) => {
      source.tables.SpellDuration.find((row) => row.id === 1).Duration = 15000;
    },
    (source) => {
      source.tables.SpellEffect.find((row) => row.SpellID === 1291089).EffectSpellClassMask[0] = -1;
    },
    (source) => {
      source.tables.ItemXItemEffect.find((row) => row.ItemID === 272436).ItemEffectID = 235971;
    },
    (source) => {
      source.ranks.find((row) => row.spellId === 19943).mask[0] = -2147483648;
    },
  ]) {
    const changed = structuredClone(fixture);
    mutate(changed);
    assert.throws(() => extractPaladinHealingLibrams(changed));
  }
});

test("rendered runtime uses source-derived IDs and leaves Infusion to its existing registration", () => {
  const implementation = readFileSync(
    new URL("./paladin-healing-librams.go", import.meta.url),
    "utf8",
  );
  const rendered = renderPaladinHealingLibrams({
    implementation,
    rules: extractPaladinHealingLibrams(fixture),
  });
  assert(!rendered.includes("// KFC_PALADIN_LIBRAM_VALUES"));
  assert(rendered.includes("const kfcPaladinEconomyReduction = 5"));
  assert(rendered.includes("const kfcPaladinAlacrityReductionMs = 200"));
  assert(!rendered.includes("BonusCritRating"));
  assert.throws(() =>
    renderPaladinHealingLibrams({
      implementation: "",
      rules: extractPaladinHealingLibrams(fixture),
    }),
  );
});
