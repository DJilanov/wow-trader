import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { collectClassSpellEvidence } from "./class-spell-evidence.mjs";
import { extractShamanHealingSource } from "./shaman-healing-source.mjs";

const bytes = readFileSync(
  new URL("./fixtures/shaman-client-healing-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "3253264da0af56c7abeb9541e463751766140df618134508068d459fb6c2be13",
);
const raw = gunzipSync(bytes, { maxOutputLength: 4_000_000 });
assert.equal(
  createHash("sha256").update(raw).digest("hex"),
  "b591246b64356e2350ea216112f41ad6a01f0ba15ec2a85a38c5e2379934d7c3",
);
const evidence = JSON.parse(raw),
  baseline = extractShamanHealingSource(evidence);

function corrupt(mutate, expected) {
  const source = globalThis.structuredClone(evidence);
  mutate(source);
  assert.throws(() => extractShamanHealingSource(source), expected);
}

test("Shaman source reproduces the captured current-client graph without numerical admission", () => {
  const actual = collectClassSpellEvidence({
    className: "Shaman",
    classMask: 64,
    tables: new Map(Object.entries({ ...evidence.rawTables, ...evidence.lookupTables })),
    talents: evidence.classTalents,
  });
  for (const [key, value] of Object.entries(actual)) assert.deepEqual(value, evidence[key], key);
  assert.equal(evidence.rootSpellIds.length, 370);
  assert.equal(evidence.spellIds.length, 588);
  assert.equal(baseline.sourceBuild, 70532);
});

test("all nineteen basic heal ranks preserve their actual costs, casts and coefficients", () => {
  assert.equal(baseline.ranks.length, 19);
  assert.deepEqual(
    Object.fromEntries(
      ["healing-wave", "lesser-healing-wave", "chain-heal"].map((family) => [
        family,
        baseline.ranks.filter((row) => row.family === family).map((row) => row.rank),
      ]),
    ),
    {
      "healing-wave": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "lesser-healing-wave": [1, 2, 3, 4, 5, 6],
      "chain-heal": [1, 2, 3],
    },
  );
  const wave = baseline.ranks.find((row) => row.id === 25357);
  assert.equal(wave.mana, 620);
  assert.equal(wave.castMs, 3000);
  assert.equal(wave.coefficient, 0.857);
  const lesser = baseline.ranks.find((row) => row.id === 10468);
  assert.equal(lesser.mana, 380);
  assert.equal(lesser.castMs, 1500);
  assert.equal(lesser.coefficient, 0.429);
  assert(baseline.ranks.every((row) => row.gcdMs === 1500 && row.range === 40));
});

test("chain fields and target encodings are retained without inventing server routing", () => {
  const chain = baseline.ranks.find((row) => row.id === 10623);
  assert.equal(chain.chainTargets, 3);
  assert.equal(chain.chainAmplitude, 0.5);
  assert.deepEqual(chain.targetEncoding, [45, 0]);
  const wave = baseline.ranks.find((row) => row.id === 331);
  assert.equal(wave.chainTargets, 0);
  assert.equal(wave.chainAmplitude, 0.2);
  assert.deepEqual(baseline.ranks.find((row) => row.id === 8004).targetEncoding, [21, 0]);
  assert.equal(baseline.chainRoutingVerified, false);
});

test("raw ability candidates do not certify spell ownership or a complete Shaman", () => {
  assert(evidence.rootAbilityRows.some((row) => row.Spell === 408521));
  assert(!baseline.ranks.some((row) => [408521, 1239242, 1239243, 5394].includes(row.id)));
  assert(baseline.ranks.every((row) => row.trainingVerified === false));
  for (const flag of [
    "trainingVerified",
    "acquisitionVerified",
    "serverMechanicsVerified",
    "chainRoutingVerified",
    "talentMechanicsComplete",
    "workloadAdmitted",
    "modelAdmission",
    "numericalQualification",
    "publicationAllowed",
    "classClockStarted",
  ])
    assert.equal(baseline[flag], false, flag);
  assert.equal(baseline.nativeJobs + baseline.browserJobs, 0);
});

test("missing ranks, duplicate records and unsupported candidates fail closed", () => {
  corrupt((source) => {
    source.rootAbilityRows = source.rootAbilityRows.filter((row) => row.Spell !== 25357);
  }, /Missing healing-wave ranks/);
  corrupt((source) => {
    source.rawTables.SpellEffect.push(
      globalThis.structuredClone(source.rawTables.SpellEffect.find((row) => row.SpellID === 331)),
    );
  }, /Expected one SpellEffect/);
  corrupt((source) => {
    source.rawTables.SpellName.push({ id: 331, Name_lang: "Healing Wave" });
  }, /Duplicate SpellName ID/);
  corrupt((source) => {
    source.rootAbilityRows.find((row) => row.Spell === 331).ClassMask = 0;
  });
  corrupt((source) => {
    source.rootAbilityRows.find((row) => row.Spell === 331).AcquireMethod = 3;
  }, /Unsupported candidate acquisition/);
});

test("conditional mana, unknown coefficients and non-finite values are rejected", () => {
  corrupt((source) => {
    source.rawTables.SpellPower.find((row) => row.SpellID === 10468).PowerCostPct = 5;
  }, /Unsupported PowerCostPct/);
  corrupt((source) => {
    source.rawTables.SpellEffect.find((row) => row.SpellID === 10623).EffectBonusCoefficient = 1;
  });
  corrupt((source) => {
    source.rawTables.SpellEffect.find((row) => row.SpellID === 10623).Variance = Number.NaN;
  }, /Invalid variance/);
  corrupt((source) => {
    source.rawTables.SpellPower.find((row) => row.SpellID === 331).ManaCost = -1;
  }, /Invalid mana/);
});

test("changed target, extra effects, chain count and cast semantics require review", () => {
  corrupt((source) => {
    source.rawTables.SpellEffect.find((row) => row.SpellID === 10623).EffectChainTargets = 4;
  });
  corrupt((source) => {
    source.rawTables.SpellEffect.find((row) => row.SpellID === 10623).ImplicitTarget = [6, 0];
  });
  corrupt((source) => {
    source.rawTables.SpellEffect.find((row) => row.SpellID === 10623).EffectAura = 8;
  }, /Unsupported EffectAura/);
  corrupt((source) => {
    source.lookupTables.SpellCastTimes.find((row) => row.id === 19).Minimum = 1500;
  }, /Variable cast time/);
});

test("source identity is validated and extraction does not mutate or alias evidence", () => {
  corrupt((source) => {
    source.source.hotfixSha256 = "unknown";
  }, /Missing client source identity/);
  corrupt((source) => {
    source.source.build.buildNumber = 1;
  });
  const before = JSON.stringify(evidence),
    result = extractShamanHealingSource(evidence);
  result.source.build.buildNumber = 1;
  result.ranks[0].targetEncoding[0] = 0;
  assert.equal(JSON.stringify(evidence), before);
});
