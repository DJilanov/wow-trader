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
import { renderPriestHealingTalentSources } from "./priest-healing-talents-model.mjs";
import { renderPriestActiveHealingSources } from "./priest-healing-active-spells-model.mjs";
import {
  extractPriestHealingBenchmarkMechanics,
  renderPriestHealingBenchmarkSources,
} from "./priest-healing-benchmark-model.mjs";

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
function sources(entries) {
  return Object.fromEntries(
    Object.entries(entries).map(([name, row]) => {
      assert.equal(sha(row.source), row.byteSha256);
      return [name, row.source];
    }),
  );
}
function source(name) {
  return readFileSync(new URL("./" + name, import.meta.url), "utf8");
}
const baseline = renderPriestHealingSources({
  ...sources(
    fixture(
      "priest-healing-engine-source.v1.json.gz",
      "76c0a5888306f8ad3c0d3860d74c1866d1dbe88ff5de3b3064e5d8416f745e03",
    ).sources,
  ),
  baseline: extractPriestHealingBaseline(evidence),
  implementation: source("priest-healing-spells.go"),
});
const talents = renderPriestHealingTalentSources({
  priest: baseline.priest,
  baselineImplementation: baseline.implementation,
  ...sources(
    fixture(
      "priest-healing-talents-source.v1.json.gz",
      "4f9ad5824f21ea1395c4c194c96c57f941329b02ea1c93f34f54128fb9b45cbf",
    ).sources,
  ),
  implementation: source("priest-healing-talents.go"),
  evidence,
});
const active = renderPriestActiveHealingSources({
  priest: talents.priest,
  healingAgent: baseline.healingAgent,
  implementation: source("priest-healing-active-spells.go"),
  evidence,
});
const input = {
  priest: active.priest,
  talents: talents.talents,
  healingAgent: active.healingAgent,
  implementation: source("priest-healing-benchmark-mechanics.go"),
  evidence,
};

test("Holy Nova keeps six distinct current healing and damage rank payloads", () => {
  const data = extractPriestHealingBenchmarkMechanics(evidence);
  assert.deepEqual(
    data.nova.map((row) => row.damage.id),
    [15237, 15430, 15431, 27799, 27800, 27801],
  );
  assert.deepEqual(
    data.nova.map((row) => row.healing.id),
    [23455, 23458, 23459, 27803, 27804, 27805],
  );
  assert.deepEqual(
    data.nova.map((row) => row.mana),
    [185, 290, 400, 520, 635, 750],
  );
  assert(
    data.nova.every(
      (row) => row.damageRadius === 10 && row.healingRadius === 10 && row.gcdMs === 1500,
    ),
  );
  assert.equal(data.nova[5].healing.base, 311);
  assert.equal(data.nova[5].healing.coefficient, 0.107);
  assert.equal(data.nova[5].healing.pointsPerLevel, 0.9);
  assert.equal(data.nova[5].damage.base, 187);
  assert.equal(data.nova[5].damage.pointsPerLevel, 1.2);
});

test("Inner Focus preserves distinct client cost and crit masks including healing children", () => {
  const data = extractPriestHealingBenchmarkMechanics(evidence);
  assert.equal(data.focus.free, -100);
  assert.equal(data.focus.crit, 25);
  assert.equal(data.focus.cooldownMs, 180000);
  function affected(id, kind) {
    const mask = data.masks.find((row) => row.id === id)?.mask;
    assert(mask, String(id));
    return mask.some((value, index) => (value & data.focus[kind][index]) !== 0);
  }
  for (const id of [1240774, 10961, 10917]) {
    assert(affected(id, "freeMask"));
    assert(affected(id, "critMask"));
  }
  assert(affected(1316995, "freeMask"));
  assert(!affected(1316995, "critMask"));
  assert(affected(1316991, "critMask"));
  assert(!affected(10901, "critMask"));
  assert(!affected(10929, "critMask"));
  assert.deepEqual(data.channels[3], { parent: 1316995, child: 1316991 });
});

test("benchmark extraction does not grant class, workload or numerical qualification", () => {
  const data = extractPriestHealingBenchmarkMechanics(evidence);
  for (const key of [
    "classMechanicsAdmission",
    "workloadQualification",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(data[key], false, key);
  assert.equal(data.assumptions.incomingDamage, "explicit-post-mitigation-before-absorbs");
});

for (const [name, mutate] of [
  [
    "missing Nova rank",
    (data) => {
      data.rootAbilityRows = data.rootAbilityRows.filter((row) => row.Spell !== 27801);
    },
  ],
  [
    "missing Nova healing child",
    (data) => {
      data.references = data.references.filter((row) => !(row.from === 27801 && row.to === 27805));
    },
  ],
  [
    "missing Nova radius",
    (data) => {
      data.rawTables.SpellEffect.find(
        (row) => row.SpellID === 27805 && row.EffectIndex === 0,
      ).EffectRadiusIndex = [0, 0];
    },
  ],
  [
    "changed Inner Focus operation",
    (data) => {
      data.rawTables.SpellEffect.find(
        (row) => row.SpellID === 14751 && row.EffectIndex === 1,
      ).EffectMiscValue[0] = 14;
    },
  ],
  [
    "unsupported scaling table",
    (data) => {
      data.rawTables.SpellScaling.push({ SpellID: 27805 });
    },
  ],
  [
    "conditional Nova mana cost",
    (data) => {
      data.rawTables.SpellPower.find((row) => row.SpellID === 27801).ManaCostPerLevel = 1;
    },
  ],
])
  test(`rejects ${name} instead of silently using incompatible mechanics`, () => {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractPriestHealingBenchmarkMechanics(changed));
  });

test("benchmark rendering preserves inputs and isolates healing changes from DPS registration", () => {
  const before = globalThis.structuredClone(input);
  const rendered = renderPriestHealingBenchmarkSources(input);
  assert.deepEqual(input, before);
  assert.deepEqual(rendered, renderPriestHealingBenchmarkSources(input));
  assert(rendered.priest.includes("if !priest.KFCHealingMode { priest.registerHolyNovaSpell() }"));
  assert(rendered.healingAgent.includes("basePriest.KFCHealingMode = true"));
  assert(rendered.healingAgent.includes("RegisterKFCHealingDamageTracking()"));
  assert(
    rendered.talents.includes(
      "if priest.KFCHealingMode { priest.registerKFCHealingInnerFocus(); return }",
    ),
  );
  assert(!rendered.implementation.includes("// KFC_CLIENT_HEALING_BENCHMARK"));
  assert.throws(() => renderPriestHealingBenchmarkSources({ ...input, priest: rendered.priest }));
});
