import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinHealingBaseline,
  renderPaladinHealingBaseline,
} from "./paladin-healing-model.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-baseline-source.v1.json.gz", import.meta.url)),
  ),
);

test("extracts all fifteen current basic Paladin ranks without granting acquisition", () => {
  const result = extractPaladinHealingBaseline(source);
  assert.equal(result.sourceBuild, 70532);
  assert.equal(result.ranks.length, 15);
  const holy = result.ranks.filter((row) => row.family === "holy-light");
  const flash = result.ranks.filter((row) => row.family === "flash-of-light");
  assert.deepEqual(
    holy.map((row) => row.rank),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.deepEqual(
    flash.map((row) => row.rank),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(holy.find((row) => row.id === 1042).mana, 275);
  assert.equal(flash.at(-1).coefficient, 0.429);
  assert.equal(flash.at(-1).castMs, 1500);
  assert.equal(holy.at(-1).castMs, 2500);
  for (const key of [
    "trainingVerified",
    "acquisitionVerified",
    "serverMechanicsVerified",
    "talentMechanicsComplete",
    "workloadAdmitted",
    "modelAdmission",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(result[key], false, key);
});

test("requires provenance for the actual zero-class-mask rank and rejects other inferred candidates", () => {
  const missing = structuredClone(source);
  missing.supplements = [];
  assert.throws(() => extractPaladinHealingBaseline(missing));
  const unknown = structuredClone(source);
  for (const row of unknown.tables.SkillLineAbility) if (row.Spell === 639) row.ClassMask = 0;
  assert.throws(() => extractPaladinHealingBaseline(unknown), /Unreviewed zero-class-mask/);
  const incomplete = structuredClone(source);
  incomplete.rootSpellIds = incomplete.rootSpellIds.filter((id) => id !== 1042);
  assert.throws(() => extractPaladinHealingBaseline(incomplete), /Missing holy-light/);
});

test("rejects conditional mana, unsupported masks, payloads and missing range evidence", () => {
  for (const change of [
    (data) => {
      data.tables.SpellPower[0].PowerCostPct = 1;
    },
    (data) => {
      data.tables.SpellClassOptions[0].SpellClassMask[0] = 0;
    },
    (data) => {
      data.tables.SpellEffect[0].EffectTriggerSpell = 1;
    },
    (data) => {
      data.tables.SpellEffect[0].EffectBonusCoefficient = 0.8;
    },
    (data) => {
      data.lookupTables.SpellRange = [];
    },
  ]) {
    const data = structuredClone(source);
    change(data);
    assert.throws(() => extractPaladinHealingBaseline(data));
  }
});

test("rejects duplicate or nonfinite source rows without changing the source", () => {
  const before = JSON.stringify(source);
  const duplicate = structuredClone(source);
  duplicate.tables.SpellEffect.push(duplicate.tables.SpellEffect[0]);
  assert.throws(() => extractPaladinHealingBaseline(duplicate), /SpellEffect/);
  const invalid = structuredClone(source);
  invalid.tables.SpellEffect[0].EffectBasePointsF = Number.NaN;
  assert.throws(() => extractPaladinHealingBaseline(invalid));
  extractPaladinHealingBaseline(source);
  assert.equal(JSON.stringify(source), before);
});

test("renders the actual ranked engine input and rejects missing or duplicate markers", () => {
  const implementation = readFileSync(
      new URL("./paladin-healing-baseline.go", import.meta.url),
      "utf8",
    ),
    baseline = extractPaladinHealingBaseline(source),
    rendered = renderPaladinHealingBaseline({ implementation, baseline });
  assert(!rendered.includes("// KFC_PALADIN_CLIENT_RANKS"));
  assert.equal((rendered.match(/\{ID:/g) ?? []).length, 15);
  assert(rendered.includes("ID:1042,Rank:5"));
  assert.throws(() => renderPaladinHealingBaseline({ implementation: "package holy", baseline }));
  assert.throws(() =>
    renderPaladinHealingBaseline({
      implementation: implementation + "// KFC_PALADIN_CLIENT_RANKS",
      baseline,
    }),
  );
});
