import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { renderPriestEnergeticRod } from "./priest-energetic-rod.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  source = fixture("priest-energetic-rod-integration-source.v1.json.gz"),
  evidence = fixture("druid-item-resources-source.v1.json.gz"),
  implementation = readFileSync(new URL("./priest-energetic-rod.go", import.meta.url), "utf8");

test("Priest Rod derives current mana payloads without changing frozen actor or shared resource sources", () => {
  const input = { actor: source.actor, implementation, evidence },
    before = structuredClone(input),
    result = renderPriestEnergeticRod(input);
  assert.deepEqual(input, before);
  assert.equal(result.rules.mana, 48);
  assert.equal(result.rules.holyNovaHarmfulParentAdmitted, true);
  assert.equal(result.rules.newOffensiveWorkloadPrioritiesAdmitted, false);
  assert.equal(result.rules.serverMechanicsVerified, false);
  assert(result.actor.includes("hpriest.registerKFCEnergeticRod()"));
  assert(result.implementation.includes("candidate == spell"));
  assert(result.implementation.includes("core.ProcMaskSpellDamage"));
});

test("Rod derivation rejects incompatible actor/template and changed captured payloads", () => {
  assert.throws(() => renderPriestEnergeticRod({ actor: "", implementation, evidence }));
  assert.throws(() =>
    renderPriestEnergeticRod({ actor: source.actor, implementation: "", evidence }),
  );
  const changed = structuredClone(evidence);
  changed.tables.SpellEffect.find((row) => row.SpellID === 1302191).EffectBasePointsF = 49;
  assert.throws(() =>
    renderPriestEnergeticRod({ actor: source.actor, implementation, evidence: changed }),
  );
});
