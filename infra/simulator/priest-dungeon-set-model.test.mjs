import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { validatePriestDungeonSets } from "./priest-dungeon-set-model.mjs";

const bytes = readFileSync(
  new URL("./fixtures/priest-dungeon-sets-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "6a85eaa8ade71db5571fb720cd6eb87c70baf9dcd36231599768a2568baae862",
);
const evidence = JSON.parse(gunzipSync(bytes)),
  rules = validatePriestDungeonSets(evidence);

test("current Devout/Magister mana and flat-healing thresholds match the captured client", () => {
  assert.equal(rules.models.length, 2);
  for (const row of rules.models)
    assert.deepEqual(
      [row.pieces, row.manaPerProc, row.procChance, row.flatHealingAtThree, row.manaPerFiveAtSix],
      [5, 200, 0.05, 18, 8],
    );
  assert.equal(rules.defensiveFourPieceSupported, false);
  assert.equal(rules.classMechanicsAdmission, false);
  assert.equal(rules.publicationAllowed, false);
  assert.equal(rules.serverVerified, false);
});

test("changed proc chances, masks, mana, healing stats and thresholds are not accepted", () => {
  for (const mutate of [
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 450576).ProcChance = 100;
    },
    (value) => {
      value.tables.SpellAuraOptions.find((row) => row.SpellID === 450576).ProcTypeMask = [65536, 0];
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 450554).EffectBasePointsF = 300;
    },
    (value) => {
      value.tables.SpellEffect.find(
        (row) => row.SpellID === 9346 && row.EffectAura === 135,
      ).EffectBasePointsF = 19;
    },
    (value) => {
      value.tables.ItemSetSpell.find(
        (row) => row.ItemSetID === 182 && row.Threshold === 5,
      ).Threshold = 6;
    },
    (value) => {
      value.tables.SpellEffect.find((row) => row.SpellID === 450576).ImplicitTarget = [6, 0];
    },
  ]) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validatePriestDungeonSets(changed));
  }
});

test("cross-build, missing and duplicate source records fail closed", () => {
  for (const mutate of [
    (value) => {
      value.source.clientVersion = "1.60.1.70533";
    },
    (value) => {
      value.tables.ItemSet = [];
    },
    (value) => {
      value.tables.SpellEffect.push(value.tables.SpellEffect.find((row) => row.SpellID === 450554));
    },
  ]) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validatePriestDungeonSets(changed));
  }
});

test("source validation is repeatable and does not grant acquisition or class admission", () => {
  const before = JSON.stringify(evidence);
  assert.deepEqual(validatePriestDungeonSets(evidence), rules);
  assert.equal(JSON.stringify(evidence), before);
  assert.equal(rules.acquisitionReviewed, false);
});
