import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractPaladinHealingUtilities,
  renderPaladinHealingUtilities,
} from "./paladin-healing-utilities.mjs";
import {
  assertPaladinUtilityHealingJob,
  parsePaladinUtilityHealingJobReply,
} from "./paladin-utility-protocol.mjs";

const source = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/paladin-healing-utility-source.v1.json.gz", import.meta.url)),
  ),
);
const implementation = readFileSync(
  new URL("./paladin-healing-utilities.go", import.meta.url),
  "utf8",
);
const recombobulators = readFileSync(
  new URL("./paladin-recombobulators.go", import.meta.url),
  "utf8",
);
const sample = JSON.parse(
  readFileSync(new URL("./fixtures/paladin-healing-job-response.v1.json", import.meta.url)),
);

test("utility payloads preserve heal bounds, death scope and a real health-spending channel", () => {
  const before = structuredClone(source),
    rules = extractPaladinHealingUtilities(source);
  assert.deepEqual(source, before);
  assert.deepEqual(rules.belt.healing, [225, 375]);
  assert.deepEqual(rules.gauntlets.healing, [300, 500]);
  assert.equal(rules.truesilver.chance, 0.03);
  assert.equal(rules.grace.canCrit, false);
  assert.equal(rules.circle.canCrit, false);
  assert.equal(rules.circle.ticks, 10);
  assert.equal(rules.serverMechanicsVerified, false);
});

test("changed utility amount, duration, category, no-crit flags and proc triggers fail closed", () => {
  for (const mutate of [
    (s) => {
      s.tables.SpellEffect[0].EffectTriggerSpell++;
    },
    (s) => {
      s.tables.SpellEffect.find((r) => r.SpellID === 10577).Variance = 0;
    },
    (s) => {
      s.tables.ItemEffect[0].SpellCategoryID = 1153;
    },
    (s) => {
      s.tables.SpellCooldowns[0].StartRecoveryTime = 0;
    },
    (s) => {
      s.tables.SpellAuraOptions.find((r) => r.SpellID === 9778).ProcChance = 100;
    },
    (s) => {
      s.tables.SpellAuraOptions.find((r) => r.SpellID === 1300890).ProcTypeMask = [40, 0];
    },
    (s) => {
      s.tables.SpellMisc.find((r) => r.SpellID === 1300891).Attributes[2] = 0;
    },
    (s) => {
      s.tables.SpellMisc.find((r) => r.SpellID === 17447).Attributes[1] = 0;
    },
    (s) => {
      s.tables.SpellDuration.find((r) => r.id === 1).Duration = 0;
    },
    (s) => {
      s.tables.SpellRadius[0].Radius = 100;
    },
    (s) => {
      s.tables.SpellRange.find((r) => r.id === 5).RangeMax = [100, 100];
    },
    (s) => {
      s.tables.ItemSparse[0].RequiredSkill = 202;
    },
  ]) {
    const copy = structuredClone(source);
    mutate(copy);
    assert.throws(() => extractPaladinHealingUtilities(copy));
  }
});

test("derived integration changes only owned hooks, transport, recipients and death transition", () => {
  const rendered = renderPaladinHealingUtilities(source, implementation, recombobulators);
  assert(rendered.actor.includes("holy.registerKFCPaladinHealingUtilities()"));
  assert(rendered.cooldowns.includes("4262, 8346, 11808:"));
  assert(rendered.requestRules.includes("healer.triggerKFCGraceDeathHeal(sim)"));
  assert(rendered.recombobulators.includes("policy.ItemID == 8346"));
  for (const field of ["utilityHealingCanCrit", "circleChannelScales"])
    assert(rendered.workload.includes(`json:"${field},omitempty"`));
  assert.throws(() =>
    renderPaladinHealingUtilities(
      { ...source, integration: { ...source.integration, actor: "" } },
      implementation,
      recombobulators,
    ),
  );
});

test("utility targeting extends friendly heals without weakening older boundaries or mutating the job", () => {
  assertPaladinUtilityHealingJob(sample.request);
  for (const itemId of [4262, 8346]) {
    const job = structuredClone(sample.request);
    job.workload.cooldowns = [
      { itemId, targetRaidIndex: itemId === 4262 ? 0 : -1, minimumMissingHealth: 100 },
    ];
    job.workload.utilityHealingCanCrit = false;
    const before = structuredClone(job);
    assertPaladinUtilityHealingJob(job);
    assert.deepEqual(job, before);
    for (const targetRaidIndex of [-2, 39, 0.5, "0", null]) {
      const copy = structuredClone(job);
      copy.workload.cooldowns[0].targetRaidIndex = targetRaidIndex;
      assert.throws(() => assertPaladinUtilityHealingJob(copy));
    }
    for (const minimumMissingHealth of [-1, 1000001, NaN, "1", null]) {
      const copy = structuredClone(job);
      copy.workload.cooldowns[0].minimumMissingHealth = minimumMissingHealth;
      assert.throws(() => assertPaladinUtilityHealingJob(copy));
    }
  }
  for (const itemId of [11808, 20512, 13444])
    assert.throws(() =>
      assertPaladinUtilityHealingJob({
        ...sample.request,
        workload: { ...sample.request.workload, cooldowns: [{ itemId, targetRaidIndex: 0 }] },
      }),
    );
  assert.throws(() =>
    assertPaladinUtilityHealingJob({
      ...sample.request,
      workload: { ...sample.request.workload, cooldowns: [{ itemId: 4262, targetRaidIndex: 1 }] },
    }),
  );
});

test("uncertain critical and channel references require booleans in both directions", () => {
  for (const field of ["utilityHealingCanCrit", "circleChannelScales"]) {
    for (const value of [false, true]) {
      assertPaladinUtilityHealingJob({
        ...sample.request,
        workload: { ...sample.request.workload, [field]: value },
      });
      const reply = structuredClone(sample.reply);
      reply.result[field] = value;
      assert.equal(
        parsePaladinUtilityHealingJobReply(
          JSON.stringify(reply),
          sample.request.id,
          sample.request.detail,
        ).result[field],
        value,
      );
    }
    for (const value of [null, 0, "true", {}]) {
      assert.throws(() =>
        assertPaladinUtilityHealingJob({
          ...sample.request,
          workload: { ...sample.request.workload, [field]: value },
        }),
      );
      const reply = structuredClone(sample.reply);
      reply.result[field] = value;
      assert.throws(() =>
        parsePaladinUtilityHealingJobReply(
          JSON.stringify(reply),
          sample.request.id,
          sample.request.detail,
        ),
      );
    }
  }
});
