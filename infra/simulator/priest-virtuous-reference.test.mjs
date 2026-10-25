import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { renderPriestVirtuousReference } from "./priest-virtuous-reference.mjs";

const implementation = readFileSync(
    new URL("./priest-virtuous-reference.go", import.meta.url),
    "utf8",
  ),
  evidence = JSON.parse(
    gunzipSync(
      readFileSync(new URL("./fixtures/priest-virtuous-source.v1.json.gz", import.meta.url)),
    ),
  );

test("Virtuous reference renders current base-set constants and preserves pending policies", () => {
  const before = structuredClone(evidence),
    code = renderPriestVirtuousReference({ implementation, evidence });
  for (const entry of [
    "kfcVirtuousSetID = 514",
    "kfcVirtuousShieldAmount = 488",
    "kfcVirtuousShieldDurationMs = 30000",
    "kfcVirtuousICDMs = 60000",
    "kfcVirtuousProcChance = 0.02",
    "EligibleIncoming func(*Spell, *SpellResult) bool",
    "FamilyMultiplier float64",
  ])
    assert(code.includes(entry), entry);
  assert.deepEqual(evidence, before);
  assert(!code.includes("NewItemSet("));
});

test("Virtuous reference cannot render altered source payload or an ambiguous template", () => {
  const changed = structuredClone(evidence);
  changed.tables.SpellEffect.find((row) => row.SpellID === 27779).EffectBasePointsF = 350;
  assert.throws(() => renderPriestVirtuousReference({ implementation, evidence: changed }));
  assert.throws(() => renderPriestVirtuousReference({ implementation: "package core", evidence }));
  assert.throws(() =>
    renderPriestVirtuousReference({
      implementation: implementation + "\n// KFC_VIRTUOUS_CLIENT_CONSTANTS",
      evidence,
    }),
  );
});
