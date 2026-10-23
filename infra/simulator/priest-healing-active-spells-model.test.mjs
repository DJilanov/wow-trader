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
import {
  extractPriestActiveHealing,
  renderPriestActiveHealingSources,
} from "./priest-healing-active-spells-model.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
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
function sources(entries) {
  return Object.fromEntries(
    Object.entries(entries).map(([key, row]) => {
      assert.equal(sha(row.source), row.byteSha256);
      return [key, row.source];
    }),
  );
}
const baseline = renderPriestHealingSources({
  ...sources(engine.sources),
  baseline: extractPriestHealingBaseline(evidence),
  implementation: readFileSync(new URL("./priest-healing-spells.go", import.meta.url), "utf8"),
});
const talents = renderPriestHealingTalentSources({
  priest: baseline.priest,
  baselineImplementation: baseline.implementation,
  ...sources(talentEngine.sources),
  implementation: readFileSync(new URL("./priest-healing-talents.go", import.meta.url), "utf8"),
  evidence,
});
const input = {
  priest: talents.priest,
  healingAgent: baseline.healingAgent,
  implementation: readFileSync(
    new URL("./priest-healing-active-spells.go", import.meta.url),
    "utf8",
  ),
  evidence,
};

test("all eighteen current active healing rank candidates are captured", () => {
  const data = extractPriestActiveHealing(evidence);
  assert.equal(data.ranks.length, 18);
  for (const [family, count] of [
    ["binding-heal", 6],
    ["penance", 4],
    ["prayer-of-healing", 5],
    ["prayer-of-mending", 3],
  ])
    assert.equal(data.ranks.filter((row) => row.family === family).length, count, family);
  assert.equal(data.ranks.find((row) => row.id === 1240774).base, 825);
  assert.equal(data.ranks.find((row) => row.id === 1240827).base, 413);
  assert.equal(data.ranks.find((row) => row.id === 1240827).mana, 390);
});

test("Binding Heal retains separate source effects and its self-target exclusion", () => {
  const rank = extractPriestActiveHealing(evidence).ranks.find((row) => row.id === 1240770);
  assert.equal(rank.pointsPerLevel, 2.5);
  assert.equal(rank.secondary.pointsPerLevel, 2.2);
  assert.equal(rank.coefficient, 0.429);
  assert.equal(rank.secondary.coefficient, 0.429);
  assert.equal(rank.excludeCaster, true);
  assert.equal(rank.range, 40);
});

test("healing Penance uses the actual healing children and channel timing", () => {
  const ranks = extractPriestActiveHealing(evidence).ranks.filter(
    (row) => row.family === "penance",
  );
  assert.deepEqual(
    ranks.map((row) => row.payloadId),
    [402289, 1240723, 1240724, 1316991],
  );
  assert.deepEqual(
    ranks.map((row) => row.base),
    [126, 200, 268, 425],
  );
  assert(
    ranks.every(
      (row) =>
        row.coefficient === 0.19 &&
        row.channelPeriodMs === 1000 &&
        row.channelDurationMs === 2000 &&
        row.cooldownMs === 12000,
    ),
  );
});

test("party radius, Holy Reach and the client target restriction are preserved", () => {
  const data = extractPriestActiveHealing(evidence),
    rank = data.ranks.find((row) => row.id === 10961);
  assert.equal(rank.radius, 40);
  assert.equal(rank.range, 40);
  assert.equal(rank.excludedTargetAura, 1231681);
  assert.deepEqual(data.holyReach, [0, 10, 20]);
});

test("Mending retains its explicit multiplicative formula and bounded proc assumptions", () => {
  const data = extractPriestActiveHealing(evidence),
    rank = data.ranks.find((row) => row.id === 1240827);
  assert.equal(rank.charges, 5);
  assert.equal(rank.travelSpeed, 40);
  assert.equal(data.mendingMaxCharges, 5);
  assert.equal(rank.radius, 20);
  assert.equal(rank.cooldownMs, 10000);
  assert.equal(data.mendingDurationMs, 30000);
  assert.equal(
    data.assumptions.mendingFormula,
    "(base+coefficient*healing-power)*(1+twin/100)*(1+spiritual/100)",
  );
  assert.equal(data.assumptions.mendingTotalTriggers, "five-from-aura-stack-cap");
  for (const key of [
    "trainingVerified",
    "serverMechanicsVerified",
    "modelAdmission",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(data[key], false, key);
});

for (const [name, mutate] of [
  [
    "missing Binding rank",
    (data) => {
      data.rootAbilityRows = data.rootAbilityRows.filter((row) => row.Spell !== 1240772);
    },
  ],
  [
    "missing Penance child",
    (data) => {
      data.references = data.references.filter(
        (row) => !(row.from === 1316995 && row.to === 1316991),
      );
    },
  ],
  [
    "new scaling table",
    (data) => {
      data.rawTables.SpellScaling.push({ SpellID: 1240774 });
    },
  ],
  [
    "changed Mending formula",
    (data) => {
      data.lookupTables.SpellDescriptionVariables.find((row) => row.id === 1015).Variables =
        "$mult=${1}";
    },
  ],
  [
    "missing party radius",
    (data) => {
      data.lookupTables.SpellRadius = data.lookupTables.SpellRadius.filter((row) => row.id !== 23);
    },
  ],
  [
    "changed Binding target flag",
    (data) => {
      data.rawTables.SpellMisc.find((row) => row.SpellID === 1240774).Attributes[1] = 0;
    },
  ],
  [
    "changed Holy Reach mask",
    (data) => {
      data.rawTables.SpellEffect.find(
        (row) => row.SpellID === 27789 && row.EffectIndex === 1,
      ).EffectSpellClassMask = [0, 0, 0, 0];
    },
  ],
])
  test(`rejects ${name} instead of substituting old healing mechanics`, () => {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractPriestActiveHealing(changed));
  });

test("the active component derives from preserved sources without mutating them", () => {
  const before = globalThis.structuredClone(input),
    rendered = renderPriestActiveHealingSources(input);
  assert.deepEqual(input, before);
  assert.deepEqual(rendered, renderPriestActiveHealingSources(input));
  assert(rendered.priest.includes("if !priest.KFCHealingMode { priest.registerPenanceSpell() }"));
  assert(rendered.healingAgent.includes("KFCHealingMode = true"));
  assert(rendered.priest.includes("priest.registerKFCActiveHealing()"));
  assert(!rendered.implementation.includes("// KFC_CLIENT_ACTIVE_HEALING"));
  assert.throws(() => renderPriestActiveHealingSources({ ...input, priest: rendered.priest }));
});
