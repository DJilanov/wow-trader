import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { collectClassSpellEvidence } from "./class-spell-evidence.mjs";
import { extractDruidHealingBaseline, renderDruidHealingBaseline } from "./druid-healing-model.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-client-healing-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "e3912ed6cbd434dfd20181758ed331ea0c93f3c81c85329f77ca31e601ae3c22",
);
const evidence = JSON.parse(gunzipSync(bytes, { maxOutputLength: 4_000_000 })),
  baseline = extractDruidHealingBaseline(evidence);

test("Druid class evidence reproduces from the exact current-client records", () => {
  const actual = collectClassSpellEvidence({
    className: "Druid",
    classMask: 1024,
    tables: new Map(Object.entries({ ...evidence.rawTables, ...evidence.lookupTables })),
    talents: evidence.classTalents,
  });
  for (const [key, value] of Object.entries(actual)) assert.deepEqual(value, evidence[key], key);
  assert.equal(evidence.source.build.buildNumber, 70532);
  assert.equal(evidence.spellIds.length, 491);
  assert.equal(evidence.classClockStarted, false);
});

test("Druid baseline preserves direct and periodic parts as separate client values", () => {
  assert.equal(baseline.ranks.length, 31);
  const counts = Object.fromEntries(
    ["healing-touch", "rejuvenation", "regrowth"].map((family) => [
      family,
      baseline.ranks.filter((rank) => rank.family === family).length,
    ]),
  );
  assert.deepEqual(counts, { "healing-touch": 11, rejuvenation: 11, regrowth: 9 });
  assert.equal(baseline.ranks.find((rank) => rank.id === 9889).parts[0].coefficient, 1);
  const regrowth = baseline.ranks.find((rank) => rank.id === 9858);
  assert.deepEqual(
    regrowth.parts.map((part) => [part.kind, part.coefficient]),
    [
      ["direct", 0.286],
      ["periodic", 0.071],
    ],
  );
  assert.equal(regrowth.parts[1].durationMs, 21000);
  assert.equal(regrowth.parts[1].tickMs, 3000);
  assert.equal(baseline.ranks.find((rank) => rank.id === 9841).parts[0].durationMs, 12000);
});

test("candidate spell rows do not certify raid-book acquisition, talents or a complete healer", () => {
  assert(baseline.ranks.some((rank) => rank.id === 25297));
  assert(baseline.ranks.some((rank) => rank.id === 25299));
  assert(baseline.ranks.every((rank) => !rank.trainingVerified));
  assert(!baseline.ranks.some((rank) => [18562, 408120, 408124, 408247, 740].includes(rank.id)));
  for (const key of [
    "trainingVerified",
    "serverMechanicsVerified",
    "talentMechanicsComplete",
    "workloadAdmitted",
    "modelAdmission",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(baseline[key], false, key);
});

test("unsupported coefficients, target encodings, missing ranks and costs cannot enter silently", () => {
  const corrupt = (mutate) => {
    const source = globalThis.structuredClone(evidence);
    mutate(source);
    assert.throws(() => extractDruidHealingBaseline(source));
  };
  corrupt((source) => {
    source.rawTables.SpellEffect.find(
      (row) => row.SpellID === 9858 && row.EffectIndex === 1,
    ).EffectBonusCoefficient = Number.NaN;
  });
  corrupt((source) => {
    source.rawTables.SpellEffect.find((row) => row.SpellID === 9841).ImplicitTarget = [6, 0];
  });
  corrupt((source) => {
    source.rootAbilityRows = source.rootAbilityRows.filter((row) => row.Spell !== 5186);
  });
  corrupt((source) => {
    source.rawTables.SpellPower.find((row) => row.SpellID === 9889).PowerCostPct = 10;
  });
  corrupt((source) => {
    source.lookupTables.SpellCastTimes.find((row) => row.id === 22).Minimum = 3000;
  });
});

test("the compiled baseline is rendered from the same exact rank records", () => {
  const implementation = readFileSync(
      new URL("./druid-healing-baseline.go", import.meta.url),
      "utf8",
    ),
    output = renderDruidHealingBaseline({ implementation, baseline });
  assert(!output.includes("// KFC_DRUID_CLIENT_RANKS"));
  assert.equal((output.match(/\{ID:/g) ?? []).length, 31);
  assert.throws(() => renderDruidHealingBaseline({ implementation: "missing anchor", baseline }));
});
