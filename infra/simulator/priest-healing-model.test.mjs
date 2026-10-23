import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { collectClassSpellEvidence, tooltipSpellReferences } from "./class-spell-evidence.mjs";
import {
  extractPriestHealingBaseline,
  renderPriestHealingSources,
} from "./priest-healing-model.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(sha(bytes), checksum);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 4_000_000 }).toString("utf8"));
}
const evidence = fixture(
    "priest-client-healing-source.v1.json.gz",
    "e4ed880f99c62ca8de42ee1f20e22800541df6849d90e56b15811b4d0e3940ab",
  ),
  engine = fixture(
    "priest-healing-engine-source.v1.json.gz",
    "76c0a5888306f8ad3c0d3860d74c1866d1dbe88ff5de3b3064e5d8416f745e03",
  ),
  implementation = readFileSync(new URL("./priest-healing-spells.go", import.meta.url), "utf8"),
  sources = Object.fromEntries(
    Object.entries(engine.sources).map(([key, row]) => {
      assert.equal(sha(row.source), row.byteSha256);
      return [key, row.source];
    }),
  );

test("the real class graph reproduces from its archived records", () => {
  const result = collectClassSpellEvidence({
    className: "Priest",
    classMask: 16,
    tables: new Map(Object.entries({ ...evidence.rawTables, ...evidence.lookupTables })),
    talents: evidence.classTalents,
  });
  for (const [key, value] of Object.entries(result)) assert.deepEqual(value, evidence[key], key);
  assert.equal(result.spellIds.length, 579);
  assert.equal(result.rootSpellIds.length, 450);
});

test("Penance healing children and spell restrictions are captured beyond trigger IDs", () => {
  assert(
    evidence.references.some(
      (row) => row.from === 1316995 && row.to === 1316991 && row.kind === "spell-text",
    ),
  );
  assert(
    evidence.references.some(
      (row) => row.from === 402174 && row.to === 15473 && row.kind === "spell-restriction",
    ),
  );
  assert(
    evidence.rawTables.SpellEffect.some((row) => row.SpellID === 1316991 && row.Effect === 10),
  );
  assert.deepEqual(
    tooltipSpellReferences("$123s1 $123d $@spellname456 $@spelldesc789 $bh $bc"),
    [123, 456, 789],
  );
});

test("class candidates preserve source gaps and cannot become qualified healing results", () => {
  assert.equal(evidence.gaps.missingSpellNames.length, 54);
  assert.deepEqual(evidence.gaps.missingRadii, []);
  assert.equal(evidence.classTalents.filter((row) => row.layoutResolved).length, 52);
  for (const key of [
    "trainingVerified",
    "serverMechanicsVerified",
    "modelAdmission",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(evidence[key], false, key);
});

test("baseline extraction keeps 39 ranked candidates separate from conditional Renew variants", () => {
  const baseline = extractPriestHealingBaseline(evidence);
  assert.equal(baseline.ranks.length, 39);
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(baseline.ranks.map((row) => row.family))].map((family) => [
        family,
        baseline.ranks.filter((row) => row.family === family).length,
      ]),
    ),
    { "flash-heal": 7, "greater-heal": 5, heal: 4, "lesser-heal": 3, renew: 10, shield: 10 },
  );
  assert(!baseline.ranks.some((row) => row.id >= 425268 && row.id <= 425277));
  assert(baseline.ranks.every((row) => row.trainingVerified === false));
  assert.equal(baseline.weakenedSoulMs, 15000);
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

test("actual Flash Heal, Renew and shield coefficients, costs and durations survive extraction", () => {
  const baseline = extractPriestHealingBaseline(evidence),
    rank = (id) => baseline.ranks.find((row) => row.id === id);
  assert.equal(rank(10917).coefficient, 0.429);
  assert.equal(rank(10917).base, 825);
  assert.equal(rank(10917).castMs, 1500);
  assert.equal(rank(10917).mana, 380);
  assert.equal(rank(10929).coefficient, 0.2);
  assert.equal(rank(10929).durationMs, 15000);
  assert.equal(rank(10929).tickMs, 3000);
  assert.equal(rank(10901).base, 928);
  assert.equal(rank(10901).coefficient, 0.1);
  assert.equal(rank(10901).durationMs, 30000);
  assert.equal(rank(10901).cooldownMs, 4000);
});

for (const [label, mutate] of [
  [
    "missing cost",
    (data) => {
      data.rawTables.SpellPower = data.rawTables.SpellPower.filter((row) => row.SpellID !== 10917);
    },
  ],
  [
    "conditional cost",
    (data) => {
      data.rawTables.SpellPower.find((row) => row.SpellID === 10917).RequiredAuraSpellID = 17;
    },
  ],
  [
    "missing rank",
    (data) => {
      data.rawTables.Spell.find((row) => row.id === 10917).NameSubtext_lang = "";
    },
  ],
  [
    "rank gap",
    (data) => {
      data.rootAbilityRows = data.rootAbilityRows.filter((row) => row.Spell !== 9473);
    },
  ],
  [
    "missing duration",
    (data) => {
      data.lookupTables.SpellDuration = data.lookupTables.SpellDuration.filter(
        (row) => row.id !== 8,
      );
    },
  ],
])
  test(`refuses ${label} instead of inventing healing mechanics`, () => {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractPriestHealingBaseline(changed));
  });

test("the overlay renders from real engine sources without changing the sources or client archive", () => {
  const before = globalThis.structuredClone(evidence),
    baseline = extractPriestHealingBaseline(evidence),
    input = { ...sources, implementation, baseline };
  const output = renderPriestHealingSources(input);
  assert.deepEqual(evidence, before);
  assert.deepEqual(output, renderPriestHealingSources(input));
  assert(output.priest.includes("priest.registerKFCBaselineHealing()"));
  assert(output.healingAgent.includes("unit.EnableHealthBar()"));
  assert(!output.implementation.includes("// KFC_CLIENT_HEALING_RANKS"));
  assert.throws(
    () => renderPriestHealingSources({ ...input, priest: output.priest }),
    /anchor changed/,
  );
});
