import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  paladinDormantHeartPolicies,
  renderPaladinHealingItems,
} from "./paladin-healing-items.mjs";
import {
  assertPaladinHealingItemPolicy,
  assertPaladinItemHealingJob,
  parsePaladinItemHealingJobReply,
} from "./paladin-healing-item-protocol.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  integration = fixture("paladin-healing-items-integration-source.v1.json.gz"),
  input = {
    ...integration,
    heartSource: readFileSync(new URL("./priest-dormant-heart.go", import.meta.url), "utf8"),
    resourceSource: readFileSync(new URL("./druid-item-resources.go", import.meta.url), "utf8"),
    familyEvidence: fixture("dormant-heart-family-source.v1.json.gz"),
    resourceEvidence: fixture("druid-item-resources-source.v1.json.gz"),
    serenityEvidence: fixture("druid-study-cooldown-source.v1.json.gz"),
    rankEvidence: fixture("paladin-baseline-source.v1.json.gz"),
  },
  sample = JSON.parse(
    readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
  );

test("Paladin item derivation retains exact shared payloads and only registered Holy Light ranks", () => {
  const before = structuredClone(input),
    result = renderPaladinHealingItems(input);
  assert.deepEqual(input, before);
  assert.deepEqual(
    result.rules.holyLightIds,
    [635, 639, 647, 1026, 1042, 3472, 10328, 10329, 25292],
  );
  assert.equal(result.rules.family.healingPower, 40);
  assert.equal(result.rules.resources.mindtap.intellectPenalty, 60);
  assert.equal(result.rules.resources.mindtap.manaPerTick, 125);
  assert.equal(result.rules.serenity.spirit, 72);
  assert(result.heart.includes("candidate != nil && candidate == spell"));
  assert(!result.heart.includes("HealingPriest") && !result.heart.includes("GreaterHeal"));
  assert(result.resources.includes('"Paladin Tapped Mind"'));
  assert(result.actor.includes("holy.registerKFCPaladinItemResources()"));
  assert(result.workload.includes('`json:"itemEffectsPolicy,omitempty"`'));
  assert(result.cooldowns.includes("policy.SpellID == 1302205"));
  for (const replacement of [
    { actor: "" },
    { workload: "" },
    { cooldowns: "" },
    { resourceSource: "" },
    { heartSource: "" },
    { common: "" },
  ])
    assert.throws(() => renderPaladinHealingItems({ ...input, ...replacement }));
});

test("all six Paladin proc policies survive native/browser transport while older jobs remain valid", () => {
  assertPaladinItemHealingJob(sample.request);
  parsePaladinItemHealingJobReply(
    JSON.stringify(sample.reply),
    sample.reply.id,
    sample.request.detail,
  );
  for (const policy of paladinDormantHeartPolicies()) {
    assert(Object.isFrozen(policy));
    assertPaladinHealingItemPolicy(policy);
    assertPaladinItemHealingJob({
      ...sample.request,
      workload: { ...sample.request.workload, itemEffectsPolicy: policy },
    });
    const reply = structuredClone(sample.reply);
    reply.result.itemEffectsPolicy = policy;
    assert.deepEqual(
      parsePaladinItemHealingJobReply(JSON.stringify(reply), reply.id, sample.request.detail).result
        .itemEffectsPolicy,
      policy,
    );
  }
});

test("Paladin policy rejects nonfinite, foreign, missing and unknown values before JSON normalization", () => {
  const policy = paladinDormantHeartPolicies()[0];
  for (const change of [
    { dormantHeartProcChance: Number.NaN },
    { dormantHeartProcChance: Number.POSITIVE_INFINITY },
    { dormantHeartProcChance: null },
    { dormantHeartProcChance: -0.01 },
    { dormantHeartProcChance: 1.01 },
    { schema: "kfc-priest-item-effects-policy.v1" },
    { extra: 1 },
    { dormantHeartHealingEvents: "periodic" },
  ])
    assert.throws(() => assertPaladinHealingItemPolicy({ ...policy, ...change }));
  const missing = { ...policy };
  delete missing.dormantHeartProcChance;
  assert.throws(() => assertPaladinHealingItemPolicy(missing));
  const job = structuredClone(sample.request);
  job.workload.itemEffectsPolicy = { ...policy, dormantHeartProcChance: Number.NaN };
  assert.throws(() => assertPaladinItemHealingJob(job));
});
