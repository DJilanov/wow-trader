import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractShamanHealingPassiveSource,
  extractShamanHealingTalentSource,
} from "./shaman-healing-talents-source.mjs";

function fixture(name, expected) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  return JSON.parse(gunzipSync(bytes));
}
const evidence = fixture(
    "shaman-client-healing-source.v1.json.gz",
    "3253264da0af56c7abeb9541e463751766140df618134508068d459fb6c2be13",
  ),
  adapter = fixture(
    "shaman-healing-talents-source.v1.json.gz",
    "f06edc8c502a76a731493c11adabfef36c6941060248092a5d94263c5a68a1b7",
  ),
  domain = extractShamanHealingTalentSource({ evidence, adapter }),
  passives = extractShamanHealingPassiveSource({ evidence, domain });

test("all fifty Shaman client talents match the captured fields, tiers and prerequisite nodes", () => {
  assert.equal(domain.fields.length, 50);
  assert.equal(new Set(domain.fields.map((entry) => entry.nodeId)).size, 50);
  assert.equal(domain.fields.filter((entry) => entry.affectsHealingStudy).length, 15);
  for (const field of [
    "mentalQuickness",
    "thunderingStrikes",
    "ancestralKnowledge",
    "totemicFocus",
  ])
    assert.equal(domain.fields.find((entry) => entry.field === field).affectsHealingStudy, true);
  assert.equal(
    domain.fields.find((entry) => entry.field === "elementalMastery").affectsHealingStudy,
    false,
  );
  assert.equal(domain.modelAdmission, false);
  assert.equal(domain.startsNewClassClock, false);
  assert.equal(domain.publicationAllowed, false);
});

test("Shaman passive extraction preserves absolute non-linear rank curves instead of raw base values", () => {
  assert.equal(passives.talents.length, 11);
  assert.equal(passives.effects, 16);
  const values = (field, index = 0) =>
    passives.talents
      .find((entry) => entry.field === field)
      .effects.find((entry) => entry.index === index).byRank;
  assert.deepEqual(values("healingWay"), [0, 8, 17, 25]);
  assert.deepEqual(values("mindfulness"), [0, 17, 33, 50]);
  assert.deepEqual(values("restorativeTotems", 0), [0, 5, 10, 15, 20, 25]);
  assert.deepEqual(values("restorativeTotems", 1), [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(values("improvedHealingWave"), [0, -100, -200, -300, -400, -500]);
  assert.equal(
    passives.talents.find((entry) => entry.field === "healingWay").effects[0].rawBasePoints,
    33,
  );
  assert.equal(
    passives.talents.find((entry) => entry.field === "mindfulness").effects[0].rawBasePoints,
    5,
  );
});

test("Shaman masks and operations retain healing, periodic and stat channels separately", () => {
  const purification = passives.talents.find((entry) => entry.field === "purification"),
    tidal = passives.talents.find((entry) => entry.field === "tidalFocus");
  assert.deepEqual(
    purification.effects.map((entry) => [entry.aura, entry.misc, entry.mask]),
    [
      [108, [0, 0], [448, 0, 16, 0]],
      [108, [22, 0], [0, 0, 16, 0]],
    ],
  );
  assert.deepEqual(
    tidal.effects.map((entry) => entry.aura),
    [108, 54, 55],
  );
  assert(
    passives.talents.every((entry) => entry.effects.every((effect) => effect.operation === 0)),
  );
  const mental = passives.talents.find((entry) => entry.field === "mentalQuickness");
  assert.equal(mental.effects.length, 2);
  assert.deepEqual(mental.unusedCurves, [
    {
      index: 2,
      curveId: 87358,
      operation: 0,
      byRank: [0, 15, 30],
      absentFromSpellEffects: true,
      modeledBonus: false,
    },
  ]);
  assert.equal(passives.sourceOnly, true);
  assert.equal(passives.modelAdmission, false);
  assert.equal(passives.rawBasePointsUsedAsRankValues, false);
});

test("Shaman talent source rejects changed ranks, layout, prerequisites and proto mappings", () => {
  for (const mutate of [
    (value) => {
      value.classTalents[0].maxRanks += 1;
    },
    (value) => {
      value.classTalents[0].layoutResolved = false;
    },
    (value) => {
      value.classTalents[0].prerequisiteNodeIds = [];
    },
    (value) => {
      value.classTalents[0].name = "Different talent";
    },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractShamanHealingTalentSource({ evidence: changed, adapter }));
  }
  assert.throws(() =>
    extractShamanHealingTalentSource({ evidence, adapter: { ...adapter, proto: "" } }),
  );
});

test("Shaman passive source rejects duplicate effects, unknown curves and unsupported modifier masks", () => {
  for (const mutate of [
    (value) => {
      value.rawTables.SpellEffect.push(
        structuredClone(value.rawTables.SpellEffect.find((entry) => entry.SpellID === 16182)),
      );
    },
    (value) => {
      value.rawTables.SpellEffect.find((entry) => entry.SpellID === 29206).EffectBasePointsF = 25;
    },
    (value) => {
      value.rawTables.SpellEffect.find((entry) => entry.SpellID === 16182).EffectSpellClassMask[0] =
        128;
    },
    (value) => {
      value.lookupTables.CurvePoint.find((entry) => entry.CurveID === 85322).Pos[1] = Number.NaN;
    },
    (value) => {
      value.lookupTables.TraitDefinitionEffectPoints.find(
        (entry) => entry.CurveID === 85322,
      ).OperationType = 1;
    },
    (value) => {
      value.lookupTables.TraitDefinitionEffectPoints.push({
        id: -1,
        TraitDefinitionID: domain.fields.find((entry) => entry.field === "healingWay").definitionId,
        EffectIndex: 3,
        OperationType: 0,
        CurveID: 85322,
      });
    },
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => extractShamanHealingPassiveSource({ evidence: changed, domain }));
  }
});

test("Shaman source extraction neither mutates nor aliases the captured class or adapter", () => {
  const originalEvidence = JSON.stringify(evidence),
    originalAdapter = JSON.stringify(adapter),
    selectedDomain = extractShamanHealingTalentSource({ evidence, adapter }),
    selectedPassives = extractShamanHealingPassiveSource({ evidence, domain: selectedDomain });
  selectedDomain.fields[0].prerequisiteNodeIds.push(-1);
  selectedDomain.trees[0].talents[0].name = "Changed";
  selectedPassives.talents[0].effects[0].mask[0] = 0;
  selectedPassives.talents[0].effects[0].byRank[1] = 100;
  assert.equal(JSON.stringify(evidence), originalEvidence);
  assert.equal(JSON.stringify(adapter), originalAdapter);
});
