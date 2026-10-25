import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinHealingActives,
  renderPaladinHealingActives,
} from "./paladin-healing-actives.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-healing-actives-source.v1.json.gz", import.meta.url)),
  ),
);

test("extracts four healing Shock ranks and keeps the distinct healing payloads", () => {
  const result = extractPaladinHealingActives(source);
  assert.equal(result.sourceBuild, 70532);
  assert.deepEqual(
    result.shock.map((row) => row.mana),
    [160, 225, 275, 325],
  );
  assert.deepEqual(
    result.shock.map((row) => row.heal.base),
    [114, 156, 230, 320],
  );
  assert(result.shock.every((row) => row.heal.coefficient === 0.429 && row.cooldownMs === 10000));
  assert.equal(result.classMechanicsAdmission, false);
  assert.equal(result.publicationAllowed, false);
});

test("extracts Vigil party range, real preparation cost and separate Favor/Infusion rules", () => {
  const result = extractPaladinHealingActives(source);
  assert.deepEqual(
    result.vigil.map((row) => row.mana),
    [730, 1000, 1340],
  );
  assert.deepEqual(
    result.vigil.map((row) => row.heal.base),
    [324, 487, 704],
  );
  assert(
    result.vigil.every(
      (row) => row.partyRadius === 40 && row.friendlyManaRefund === 0 && row.castMs === 1500,
    ),
  );
  assert.equal(result.divineFavor.baseManaFraction, 0.04);
  assert.deepEqual(result.infusion.castReductionMs, [0, 500, 1000]);
  assert.equal(result.infusion.durationMs, 15000);
  assert.equal(result.unresolvedInteractions.length, 1);
});

test("requires the actual missing-rank evidence and refuses wrong healing links", () => {
  for (const change of [
    (data) => {
      data.supplements = [];
    },
    (data) => {
      data.shock[1].heal = data.shock[1].damage;
    },
    (data) => {
      data.tables.Spell.find((row) => row.id === 20930).Description_lang = "Unverified payload";
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 25903).Effect = 2;
    },
  ]) {
    const data = structuredClone(source);
    change(data);
    assert.throws(() => extractPaladinHealingActives(data));
  }
});

test("rejects duplicated, conditional or invalid inputs without altering the source", () => {
  const before = JSON.stringify(source);
  for (const change of [
    (data) => data.tables.SpellPower.push(data.tables.SpellPower[0]),
    (data) => {
      data.tables.SpellPower.find((row) => row.SpellID === 20473).PowerCostPct = 1;
    },
    (data) => {
      data.tables.SpellPower.find((row) => row.SpellID === 20216).ManaCostPerLevel = 1;
    },
    (data) => {
      data.tables.SpellClassOptions.find((row) => row.SpellID === 20473).SpellClassMask[0] = 0;
    },
    (data) => {
      data.tables.SpellEffect.find((row) => row.SpellID === 25903).Variance = Number.NaN;
    },
    (data) => {
      data.lookupTables.SpellRadius.find((row) => row.id === 23).Radius = 30;
    },
    (data) => {
      data.lookupTables.CurvePoint[0].Pos[1] = -250;
    },
  ]) {
    const data = structuredClone(source);
    change(data);
    assert.throws(() => extractPaladinHealingActives(data));
  }
  extractPaladinHealingActives(source);
  assert.equal(JSON.stringify(source), before);
});

test("renders all seven active ranks and their captured timing constants", () => {
  const actives = extractPaladinHealingActives(source),
    implementation = readFileSync(new URL("./paladin-healing-actives.go", import.meta.url), "utf8"),
    rendered = renderPaladinHealingActives({ implementation, actives });
  assert.equal((rendered.match(/Data:kfcPaladinHealingRank\{/g) ?? []).length, 7);
  assert(rendered.includes("HealID:25903"));
  assert(rendered.includes("const kfcPaladinFavorCostFraction = 0.04"));
  assert(rendered.includes("const kfcPaladinInfusionDurationMs = 15000"));
  assert(!rendered.includes("// KFC_PALADIN_ACTIVE_VALUES"));
  assert.throws(() => renderPaladinHealingActives({ implementation: "package holy", actives }));
});
