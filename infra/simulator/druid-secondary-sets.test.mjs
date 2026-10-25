import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { extractDruidSecondarySets } from "./druid-secondary-sets.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-secondary-sets-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "ff1e14ef6a5e9277b27e90a407d8e8e5d5930391e089fb364af4970d57f312ad",
);
const source = JSON.parse(gunzipSync(bytes));

test("secondary set controls preserve exact identities, thresholds and combined healing", () => {
  const rules = extractDruidSecondarySets(source);
  assert.deepEqual(
    rules.sets.map((row) => [row.setId, row.pieces, row.spellId, row.spellPower]),
    [
      [81, 3, 14047, 23],
      [122, 5, 14047, 23],
    ],
  );
  assert.equal(rules.scope, "restoration-druid-controls");
  assert.equal(rules.otherSetEffectsAdmitted, false);
  assert.equal(rules.publicationAllowed, false);
});

test("changed set identity, thresholds, healing and damage values reject admission", () => {
  for (const mutate of [
    (row) => {
      row.tables.ItemSet[0].id = 122;
    },
    (row) => {
      row.tables.ItemSetSpell.find((row) => row.SpellID === 14047).Threshold = 2;
    },
    (row) => {
      row.tables.SpellEffect[0].EffectBasePointsF = 12;
    },
    (row) => {
      row.tables.SpellEffect[1].EffectAura = 13;
    },
    (row) => {
      row.tables.SpellEffect[1].EffectBasePointsF = 24;
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => extractDruidSecondarySets(changed));
  }
});
