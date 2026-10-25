import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { renderPriestDormantHeart, priestDormantHeartPolicies } from "./priest-dormant-heart.mjs";
import {
  assertPriestHealingItemPolicy,
  assertPriestItemHealingJob,
  parsePriestItemHealingJobReply,
} from "./priest-item-healing-protocol.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  evidence = fixture("dormant-heart-family-source.v1.json.gz"),
  source = fixture("priest-dormant-heart-integration-source.v1.json.gz"),
  implementation = readFileSync(new URL("./priest-dormant-heart.go", import.meta.url), "utf8"),
  rawJobFixture = JSON.parse(
    readFileSync(new URL("./fixtures/healing-job-response.v1.json", import.meta.url)),
  ),
  jobFixture = { request: rawJobFixture.job, reply: rawJobFixture.responses.normal };

test("Priest integration derives exact item values and preserves original actor/controller strings", () => {
  const input = { implementation, actor: source.actor, workload: source.workload, evidence },
    before = structuredClone(input),
    result = renderPriestDormantHeart(input);
  assert.deepEqual(input, before);
  assert.equal(result.rules.families.priest, "greater-heal");
  assert(result.implementation.includes("const kfcPriestHeartHealingPower = 40"));
  assert(result.implementation.includes("const kfcPriestHeartSpellDamage = 13"));
  assert(result.actor.includes("hpriest.registerKFCHealingItemEffects()"));
  assert(result.workload.includes("ItemEffectsPolicy: healer.kfcItemEffectsPolicyEcho()"));
  assert.throws(() => renderPriestDormantHeart({ ...input, actor: "" }));
});

test("all six explicit item policies pass validation without claiming server proc verification", () => {
  const policies = priestDormantHeartPolicies();
  assert.equal(policies.length, 6);
  assert.equal(new Set(policies.map((row) => row.id)).size, 6);
  for (const policy of policies) {
    assertPriestHealingItemPolicy(policy);
    assert(Object.isFrozen(policy));
    assertPriestItemHealingJob({
      ...jobFixture.request,
      workload: { ...jobFixture.request.workload, itemEffectsPolicy: policy },
    });
  }
  assertPriestItemHealingJob(jobFixture.request);
  assert.deepEqual(
    parsePriestItemHealingJobReply(JSON.stringify(jobFixture.reply), jobFixture.reply.id, true),
    jobFixture.reply,
  );
});

test("item boundary rejects nonfinite, absent, foreign, unknown and out-of-range policy fields before JSON", () => {
  const policy = priestDormantHeartPolicies()[0];
  for (const invalid of [
    null,
    [],
    {},
    { ...policy, extra: 1 },
    { ...policy, schema: "kfc-druid-item-effects-policy.v1" },
    { ...policy, id: "" },
    ...[undefined, null, -1, 1.01, Number.NaN, Number.POSITIVE_INFINITY, "1"].map(
      (dormantHeartProcChance) => ({ ...policy, dormantHeartProcChance }),
    ),
    { ...policy, dormantHeartHealingEvents: "periodic" },
  ]) {
    assert.throws(() => assertPriestHealingItemPolicy(invalid));
    assert.throws(() =>
      assertPriestItemHealingJob({
        ...jobFixture.request,
        workload: { ...jobFixture.request.workload, itemEffectsPolicy: invalid },
      }),
    );
  }
  assert.throws(() =>
    parsePriestItemHealingJobReply(
      JSON.stringify({
        ...jobFixture.reply,
        result: {
          ...jobFixture.reply.result,
          itemEffectsPolicy: { ...policy, dormantHeartProcChance: null },
        },
      }),
      jobFixture.reply.id,
      true,
    ),
  );
});
