import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { renderPriestItemResources } from "./priest-item-resources.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  source = fixture("priest-item-resources-integration-source.v1.json.gz"),
  evidence = fixture("druid-item-resources-source.v1.json.gz"),
  serenityEvidence = fixture("druid-study-cooldown-source.v1.json.gz");

test("Priest resource derivation reuses exact captured payloads without altering frozen Druid sources", () => {
  const input = { ...source, evidence, serenityEvidence },
    before = structuredClone(input),
    result = renderPriestItemResources(input);
  assert.deepEqual(input, before);
  assert.equal(result.rules.scope, "healing-priest-only");
  assert.equal(result.rules.mindtap.manaPerTick, 125);
  assert.equal(result.rules.mindtap.intellectPenalty, 60);
  assert.equal(result.rules.mindtap.sharedCooldownMs, 10000);
  assert.equal(result.rules.serenity.spirit, 72);
  assert(result.implementation.includes('"Priest Tapped Mind"'));
  assert(!result.implementation.includes("RestorationDruid"));
  assert(!result.implementation.includes("state.hasAny"));
  assert(result.actor.includes("hpriest.registerKFCPriestItemResources()"));
});

test("resource correction retains owned cooldown admission and living-caster boundaries", () => {
  const result = renderPriestItemResources({ ...source, evidence, serenityEvidence });
  assert(result.cooldowns.includes("policy.SpellID == 1302205"));
  assert(result.cooldowns.includes("13444, 272439:"));
  assert(result.implementation.includes("shared.IsReady(sim)"));
  assert(result.implementation.includes("(healer.CurrentHealth() > 0)"));
  for (const change of [{ actor: "" }, { common: "" }, { source: "" }, { cooldowns: "" }])
    assert.throws(() =>
      renderPriestItemResources({ ...source, evidence, serenityEvidence, ...change }),
    );
});
