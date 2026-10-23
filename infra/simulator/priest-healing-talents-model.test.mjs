import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  extractPriestHealingBaseline,
  renderPriestHealingSources,
} from "./priest-healing-model.mjs";
import {
  extractPriestHealingTalents,
  renderPriestHealingTalentSources,
} from "./priest-healing-talents-model.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(sha(bytes), checksum);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 4_000_000 }).toString("utf8"));
}
const evidence = fixture(
  "priest-client-healing-source.v1.json.gz",
  "e4ed880f99c62ca8de42ee1f20e22800541df6849d90e56b15811b4d0e3940ab",
);
const engine = fixture(
  "priest-healing-engine-source.v1.json.gz",
  "76c0a5888306f8ad3c0d3860d74c1866d1dbe88ff5de3b3064e5d8416f745e03",
);
const talentEngine = fixture(
  "priest-healing-talents-source.v1.json.gz",
  "4f9ad5824f21ea1395c4c194c96c57f941329b02ea1c93f34f54128fb9b45cbf",
);
function checkedSources(entries) {
  return Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => {
      assert.equal(sha(entry.source), entry.byteSha256);
      return [key, entry.source];
    }),
  );
}
const baseline = renderPriestHealingSources({
  ...checkedSources(engine.sources),
  baseline: extractPriestHealingBaseline(evidence),
  implementation: readFileSync(new URL("./priest-healing-spells.go", import.meta.url), "utf8"),
});
const inputs = {
  priest: baseline.priest,
  baselineImplementation: baseline.implementation,
  ...checkedSources(talentEngine.sources),
  implementation: readFileSync(new URL("./priest-healing-talents.go", import.meta.url), "utf8"),
  evidence,
};

test("exact client curves replace outdated linear rank guesses", () => {
  const data = extractPriestHealingTalents(evidence);
  assert.equal(Object.keys(data.talents).length, 13);
  assert.equal(data.spells.length, 71);
  assert.deepEqual(
    data.talents.SpiritualHealing.effects.map((row) => row.values),
    [
      [0, 3, 7, 10],
      [0, 3, 7, 10],
    ],
  );
  assert.deepEqual(data.talents.ImprovedPowerWordShield.effects[0].values, [0, 7, 14, 20]);
  assert.deepEqual(data.talents.Inspiration.effects[0].values, [0, 8, 17, 25]);
  assert.deepEqual(
    data.talents.RenewedHope.effects[1].values,
    [0, -1000, -2000, -3000, -4000, -5000],
  );
  assert.deepEqual(data.talents.DivineAegis.effects[1].values, [0, 20, 20, 20]);
  assert.equal(data.inspirationDurationMs, 15000);
  assert.equal(data.aegisDurationMs, 12000);
});

test("mask relationships distinguish direct heals, periodic Renew and shields", () => {
  const data = extractPriestHealingTalents(evidence),
    matches = (field, index, id) => {
      const effect = data.talents[field].effects.find((row) => row.index === index),
        spell = data.spells.find((row) => row.id === id);
      assert(effect && spell);
      return effect.mask.some((mask, offset) => (mask & spell.mask[offset]) !== 0);
    };
  assert(matches("SpiritualHealing", 0, 10917));
  assert(!matches("SpiritualHealing", 0, 10929));
  assert(matches("SpiritualHealing", 1, 10929));
  assert(!matches("SpiritualHealing", 0, 10901));
  assert(matches("DivineFury", 0, 6064));
  assert(!matches("DivineFury", 0, 2050));
  assert(matches("ImprovedHealing", 0, 10965));
  assert(!matches("ImprovedHealing", 0, 10917));
  assert(matches("TwinDisciplines", 1, 10929));
  assert(!matches("TwinDisciplines", 1, 10901));
  assert(matches("HolySpecialization", 0, 1316991));
});

test("unconfirmed proc interpretations stay explicit and cannot qualify a healer", () => {
  const data = extractPriestHealingTalents(evidence);
  assert.equal(data.assumptions.aegisHealBasis, "raw-critical-heal");
  assert.equal(data.assumptions.litanyFirstHealRefund, false);
  assert.equal(data.assumptions.litanyShieldRefund, false);
  for (const key of [
    "serverMechanicsVerified",
    "talentMechanicsComplete",
    "workloadAdmitted",
    "modelAdmission",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(data[key], false, key);
});

for (const [name, mutate] of [
  [
    "missing curve point",
    (data) => {
      data.lookupTables.CurvePoint = data.lookupTables.CurvePoint.filter(
        (row) => row.CurveID !== 83159 || row.Pos[0] !== 2,
      );
    },
  ],
  [
    "unsupported curve operation",
    (data) => {
      data.lookupTables.TraitDefinitionEffectPoints.find(
        (row) => row.CurveID === 83159,
      ).OperationType = 1;
    },
  ],
  [
    "unsupported spell modifier",
    (data) => {
      data.rawTables.SpellEffect.find(
        (row) => row.SpellID === 14898 && row.EffectIndex === 0,
      ).EffectMiscValue[0] = 99;
    },
  ],
  [
    "unresolved layout",
    (data) => {
      data.classTalents.find((row) => row.spellId === 14898).layoutResolved = false;
    },
  ],
  [
    "dynamic proc duration",
    (data) => {
      data.lookupTables.SpellDuration.find((row) => row.id === 29).DurationPerResource = 1;
    },
  ],
])
  test(`rejects ${name} before building a talent model`, () => {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractPriestHealingTalents(changed));
  });

test("unresolved display text does not substitute for actual rank curves", () => {
  const changed = globalThis.structuredClone(evidence);
  changed.classTalents.find((row) => row.spellId === 14898).ranks[0].text =
    "unresolved display text";
  assert.deepEqual(extractPriestHealingTalents(changed), extractPriestHealingTalents(evidence));
});

test("derived sources preserve the authenticated baseline and replace the legacy Inspiration path", () => {
  const before = globalThis.structuredClone(inputs),
    output = renderPriestHealingTalentSources(inputs);
  assert.deepEqual(inputs, before);
  assert.deepEqual(output, renderPriestHealingTalentSources(inputs));
  assert(output.priest.includes("priest.registerKFCHealingTalentEffects()"));
  assert(output.talents.includes("priest.registerKFCInspiration()"));
  assert(!output.talents.includes("core.InspirationAura(unit, priest.Talents.Inspiration)"));
  assert(output.baselineImplementation.includes("priest.kfcHealingOutcome(spell)"));
  assert(!output.implementation.includes("// KFC_CLIENT_HEALING_TALENTS"));
  assert.throws(
    () => renderPriestHealingTalentSources({ ...inputs, priest: output.priest }),
    /anchor changed/,
  );
});
