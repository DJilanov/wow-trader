import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  shamanHealingDisplayMetrics,
  shamanHealingEffectsSchema,
  shamanHealingJobSchema,
  shamanHealingRankPolicySchema,
  shamanHealingReplySchema,
  shamanHealingResultSchema,
  validateShamanHealingReply,
} from "./shaman-healing-simulator.js";

const bytes = readFileSync(
  new URL("./fixtures/shaman-healing-transport.v1.json.gz", import.meta.url),
);
expect(createHash("sha256").update(bytes).digest("hex")).toBe(
  "b4a6d9da76c394218ead010eb1eb907b30ed7081cd758665dcb4c36753649c3e",
);
const fixture = z
  .object({
    schema: z.literal("kfc-shaman-healing-transport-fixture.v1"),
    modelIdentity: z.literal("7431142daf248143180c1235c12260d3aadb65ce0f5fa0a9335d5f680d8e2704"),
    noNewSimulationsExecuted: z.literal(true),
    notDefaultPresetQualification: z.literal(true),
    sources: z
      .array(z.object({ path: z.string(), byteSha256: z.string().length(64) }).strict())
      .length(22),
    cases: z
      .array(
        z
          .object({
            sourcePath: z.string(),
            job: z.unknown(),
            reply: z.unknown(),
            durationSeconds: z.number().positive(),
            expectedJobValid: z.boolean(),
          })
          .strict(),
      )
      .length(29),
  })
  .strict()
  .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));

function complete(index = 0): {
  job: z.infer<typeof shamanHealingJobSchema>;
  result: z.infer<typeof shamanHealingResultSchema>;
  durationSeconds: number;
} {
  const entry = fixture.cases[index]!;
  const job = shamanHealingJobSchema.parse(entry.job);
  const reply = shamanHealingReplySchema.parse(entry.reply);
  if (reply.status !== "complete") throw new Error("Expected a captured complete native result");
  return { job, result: reply.result, durationSeconds: entry.durationSeconds };
}

describe("Shaman healer native/browser transport", () => {
  it("preserves all 126 independently reviewed equipped recommendations", () => {
    const bytes = readFileSync(
      new URL("./fixtures/shaman-confirmed-transport.v1.json.gz", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "2380b2b14c681eaa0d3698d62a46e90cf50d1e17a9f6db849c34e2f9e2099fb0",
    );
    const reference = z.object({ path: z.string(), byteSha256: z.string().length(64) }).strict();
    const actual = z
      .object({
        schema: z.literal("kfc-shaman-confirmed-transport-fixture.v1"),
        modelIdentity: z.literal(
          "7431142daf248143180c1235c12260d3aadb65ce0f5fa0a9335d5f680d8e2704",
        ),
        independentReview: reference,
        numericalSources: z.array(reference).length(4),
        actualEquippedRepliesValidated: z.literal(2016),
        noNewSimulationsExecuted: z.literal(true),
        fullClassAdmission: z.literal(false),
        cases: z
          .array(
            z
              .object({
                caseId: z.string(),
                sourceRequestKey: z.string().length(64),
                setupIdentity: z.string().length(64),
                durationSeconds: z.literal(180),
                job: z.unknown(),
                reply: z.unknown(),
              })
              .strict(),
          )
          .length(126),
      })
      .strict()
      .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
    expect(actual.independentReview.byteSha256).toBe(
      "82257c76004ce35acfe29d07a7013af6d63a8d890633c35e232ceae28836c4d2",
    );
    expect(new Set(actual.cases.map((entry) => entry.caseId)).size).toBe(126);
    const rankPolicies = new Set<string>();
    for (const entry of actual.cases) {
      const job = shamanHealingJobSchema.parse(entry.job);
      expect(job).toEqual(entry.job);
      expect(validateShamanHealingReply(job, entry.reply, entry.durationSeconds)).toEqual(
        entry.reply,
      );
      rankPolicies.add(job.workload.workload.rankScaling!.id);
    }
    expect(rankPolicies.size).toBe(7);
  });

  it("preserves 27 actual successful jobs, two actual errors and every native result field", () => {
    let completeCount = 0;
    for (const entry of fixture.cases) {
      const job = shamanHealingJobSchema.safeParse(entry.job);
      const reply = shamanHealingReplySchema.parse(entry.reply);
      // Ownership inside the protobuf request is checked by the native runtime.
      expect(job.success, entry.sourcePath).toBe(
        entry.expectedJobValid ||
          (reply.status === "error" && reply.error.code === "workload_failed"),
      );
      if (job.success) expect(job.data).toEqual(entry.job);
      expect(reply).toEqual(entry.reply);
      if (reply.status === "complete") {
        completeCount++;
        expect(job.success).toBe(true);
        if (!job.success) throw new Error("Invalid job in successful native evidence");
        expect(reply.id).toBe(job.data.id);
        expect(reply.result.equipped.runtimeIdentity).toBe(job.data.workload.runtimeIdentity);
        expect(reply.result.equipped.loadout.domainIdentity).toBe(job.data.workload.domainIdentity);
        expect(reply.result.equipped.effects).toEqual(job.data.workload.effects);
        expect(reply.result.equipped.cooldowns).toEqual(job.data.workload.cooldowns);
        expect(reply.result.rankScaling).toEqual(job.data.workload.workload.rankScaling);
        expect(reply.result.racials).toEqual(job.data.workload.workload.racials);
        expect(validateShamanHealingReply(job.data, reply, entry.durationSeconds)).toEqual(reply);
      }
    }
    expect(completeCount).toBe(27);
  });

  it("uses actual encounter durations and keeps useful mana outside support HPS", () => {
    const rosters = new Set<number>(),
      durations = new Set<number>(),
      races = new Set<number>();
    for (const [index, entry] of fixture.cases.entries()) {
      if (!entry.expectedJobValid) continue;
      const { job, result, durationSeconds } = complete(index),
        before = structuredClone(result);
      const display = shamanHealingDisplayMetrics(result, durationSeconds);
      expect(display.supportHps).toBe(result.assignment.supportHpsMean);
      expect(display.effectiveHealingHps).toBe(result.assignment.healthRestoredHpsMean);
      expect(display.absorbedHps).toBe(result.assignment.absorbedHpsMean);
      expect(display.meanMissingHealth).toBe(
        result.assignment.externalMissingHealthSecondsMean / durationSeconds,
      );
      expect(display.usefulOtherManaTideMana).toBe(result.assignment.usefulOtherManaTideManaMean);
      expect(result).toEqual(before);
      rosters.add(job.workload.workload.targets.length);
      durations.add(durationSeconds);
      races.add(result.equipped.loadout.race);
    }
    expect([...rosters].sort((a, b) => a - b)).toEqual([5, 10, 40]);
    expect([...durations].sort((a, b) => a - b)).toEqual([14, 180, 300]);
    expect([...races].sort((a, b) => a - b)).toEqual([1, 5, 6, 7, 10]);
    const { result, durationSeconds } = complete();
    expect(() => shamanHealingDisplayMetrics(result, durationSeconds + 1)).toThrow();
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1801])
      expect(() => shamanHealingDisplayMetrics(result, duration)).toThrow();
  });

  it("rejects invented support, damage, qualifications and racial use receipts", () => {
    const { result } = complete();
    for (const invalid of [
      { ...result, classQualified: true },
      { ...result, publicationAllowed: true },
      { ...result, equipped: { ...result.equipped, fullClassAdmission: true } },
      { ...result, assignment: undefined },
      { ...result, hps: result.hps + 20 },
      { ...result, rawHps: result.rawHps + 20 },
      { ...result, deliveredIncomingDamageMean: result.plannedIncomingPostMitigationDamage + 1 },
      {
        ...result,
        assignment: { ...result.assignment, supportHpsMean: result.assignment.supportHpsMean + 20 },
      },
      { ...result, assignment: { ...result.assignment, supportHpsMean: Number.NaN } },
      {
        ...result,
        assignment: {
          ...result.assignment,
          recipientManaSpentMean: (result.assignment.recipientManaSpentMean ?? 0) + 1,
        },
      },
      { ...result, racialUsesMean: [2] },
      { ...result, equipped: { ...result.equipped, cooldownUsesMean: [1] } },
    ])
      expect(shamanHealingResultSchema.safeParse(invalid).success).toBe(false);
    const invalidLedger = {
      ...result,
      assignment: {
        ...result.assignment,
        finalExternalMissingHealthMean: result.assignment.finalExternalMissingHealthMean + 100,
      },
    };
    expect(() => shamanHealingDisplayMetrics(invalidLedger, 14)).toThrow();
  });

  it("rejects unknown targets, duplicate profiles, synthetic caster health and stale controls", () => {
    const { job } = complete(),
      frame = job.workload.workload;
    for (const workload of [
      { ...frame, targets: frame.targets.map((target) => ({ ...target, raidIndex: 0 })) },
      {
        ...frame,
        targets: frame.targets.map((target) =>
          target.raidIndex === 0 ? { ...target, maximumHealth: 5000 } : target,
        ),
      },
      { ...frame, priorities: [{ ...frame.priorities[0], raidIndex: 39 }] },
      { ...frame, damage: [{ atMs: 0, raidIndex: 39, amount: 500 }] },
      { ...frame, priorities: [] },
      { ...frame, useNaturesSwiftness: false, naturesSwiftnessMinimumMissingHealth: 500 },
      { ...frame, bounceRange: 100 },
      { ...frame, damage: [{ atMs: -1, raidIndex: 1, amount: 500 }] },
      { ...frame, allowCasterDamage: true },
    ])
      expect(
        shamanHealingJobSchema.safeParse({ ...job, workload: { ...job.workload, workload } })
          .success,
      ).toBe(false);
    for (const requestBase64 of ["", "AAA", "====", "AA=", "not base64"])
      expect(shamanHealingJobSchema.safeParse({ ...job, requestBase64 }).success).toBe(false);
    expect(shamanHealingJobSchema.safeParse({ ...job, schema: "kfc-healing-job.v1" }).success).toBe(
      false,
    );
  });

  it("requires explicit rank sensitivity instead of silently changing the server formula", () => {
    const reference = {
      schema: "kfc-shaman-rank-sensitivity.v1",
      id: "unscaled-reference",
      kind: "unscaled-reference",
      fullScalingGap: 0,
      coefficientLossPerLevel: 0,
      classProcMode: "unchanged",
    };
    expect(shamanHealingRankPolicySchema.parse(reference)).toEqual(reference);
    for (const invalid of [
      { ...reference, coefficientLossPerLevel: 0.05 },
      { ...reference, fullScalingGap: 12 },
      { ...reference, classProcMode: "coefficient-factor" },
      { ...reference, kind: "level-distance-sensitivity" },
      { ...reference, coefficientLossPerLevel: Number.NaN },
    ])
      expect(shamanHealingRankPolicySchema.safeParse(invalid).success).toBe(false);
  });

  it("enforces item reference dependencies and rejects fabricated legacy spell power", () => {
    expect(shamanHealingEffectsSchema.parse({})).toEqual({});
    expect(
      shamanHealingEffectsSchema.parse({
        legacy: {
          schema: "kfc-shaman-legacy-item-policy.v1",
          id: "captured",
          briarwoodSpellPower: 15,
          royalSealSpellPower: 18,
        },
      }).legacy?.royalSealSpellPower,
    ).toBe(18);
    for (const invalid of [
      { legacy: { schema: "kfc-shaman-legacy-item-policy.v1", id: "empty" } },
      {
        legacy: {
          schema: "kfc-shaman-legacy-item-policy.v1",
          id: "fabricated",
          royalSealSpellPower: 22,
        },
      },
      {
        heart: {
          schema: "kfc-shaman-item-effects-policy.v1",
          id: "null",
          dormantHeartProcChance: null,
          dormantHeartHealingEvents: "completed-casts",
        },
      },
      {
        passiveDamage: {
          schema: "kfc-shaman-passive-damage-policy.v1",
          id: "empty",
          timing: "captured-proc-recovery-ms-reference",
        },
      },
      {
        passiveDamage: {
          schema: "kfc-shaman-passive-damage-policy.v1",
          id: "incomplete",
          timing: "captured-proc-recovery-ms-reference",
          necropileTrigger: "adaptive-damage-reference",
        },
      },
      {
        protective: {
          schema: "kfc-shaman-protective-policy.v1",
          id: "incomplete",
          cooldowns: "item-override-inherits-negative-reference",
          admiralStamina: "additive-reference",
        },
      },
      {
        protective: {
          schema: "kfc-shaman-protective-policy.v1",
          id: "incomplete",
          cooldowns: "item-override-inherits-negative-reference",
          adaptiveEnemyInMelee: false,
        },
      },
      { bonusHealing: 5000 },
    ])
      expect(shamanHealingEffectsSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects impossible faction unlocks and unowned race actions", () => {
    const { result } = complete(),
      loadout = result.equipped.loadout;
    for (const invalidLoadout of [
      { ...loadout, race: 3 },
      { ...loadout, race: 1, faction: 2 },
      {
        ...loadout,
        race: 1,
        faction: 1,
        accessPolicy: {
          ...loadout.accessPolicy,
          completedPhase: 1,
          accessReference: "horde-shaman-quest-chain-completed-reference",
        },
      },
      { ...loadout, professions: [4, 4] },
    ])
      expect(
        shamanHealingResultSchema.safeParse({
          ...result,
          equipped: { ...result.equipped, loadout: invalidLoadout },
        }).success,
      ).toBe(false);
    expect(
      shamanHealingResultSchema.safeParse({
        ...result,
        racials: {
          schema: "kfc-shaman-racial-policy.v1",
          criticalHealing: "client-aura50-reference",
          actions: [{ spellId: 20572, earliestMs: 0, maximumUses: 20 }],
        },
        racialUsesMean: [1],
      }).success,
    ).toBe(false);
  });

  it("keeps strict recipient mana costs and validates native error replies", () => {
    const { job } = complete(),
      policy = job.workload.recipientMana!;
    for (const recipientMana of [
      { ...policy, recipients: [policy.recipients[0], policy.recipients[0]] },
      { ...policy, recipients: [{ ...policy.recipients[0], startingMana: 1001 }] },
      { ...policy, recipients: [{ ...policy.recipients[0], startingMana: null }] },
      { ...policy, recipients: [{ ...policy.recipients[0], raidIndex: 0 }] },
      { ...policy, recipients: [{ ...policy.recipients[0], raidIndex: 39 }] },
    ])
      expect(
        shamanHealingJobSchema.safeParse({ ...job, workload: { ...job.workload, recipientMana } })
          .success,
      ).toBe(false);
    expect(
      shamanHealingReplySchema.parse({
        schema: "kfc-shaman-equipped-job-result.v1",
        id: job.id,
        status: "error",
        error: { code: "cancelled", message: "context canceled" },
      }).status,
    ).toBe("error");
  });

  it("rejects stale build replies, changed policies and inconsistent timing", () => {
    const { job, result, durationSeconds } = complete();
    const reply = {
      schema: "kfc-shaman-equipped-job-result.v1",
      id: job.id,
      status: "complete",
      result,
    };
    for (const changed of [
      { ...job, id: "different-job" },
      { ...job, detail: false },
      { ...job, workload: { ...job.workload, runtimeIdentity: "a".repeat(64) } },
      { ...job, workload: { ...job.workload, profileId: "different-profile" } },
      { ...job, workload: { ...job.workload, mp5Model: "per-second-reference" } },
      {
        ...job,
        workload: {
          ...job.workload,
          workload: { ...job.workload.workload, name: "different-workload" },
        },
      },
      {
        ...job,
        workload: {
          ...job.workload,
          workload: { ...job.workload.workload, damage: [{ atMs: 1, raidIndex: 1, amount: 100 }] },
        },
      },
      { ...job, workload: { ...job.workload, effects: {} } },
    ])
      expect(() =>
        validateShamanHealingReply(shamanHealingJobSchema.parse(changed), reply, durationSeconds),
      ).toThrow();
    expect(() => validateShamanHealingReply(job, reply, 10)).toThrow();
  });

  it("excludes healing of newly added capacity from useful support", () => {
    const { result, durationSeconds } = complete();
    const capacity = {
      ...result,
      equipped: {
        ...result.equipped,
        effects: shamanHealingEffectsSchema.parse({
          ...result.equipped.effects,
          protective: {
            schema: "kfc-shaman-protective-policy.v1",
            id: "capacity-accounting-control",
            cooldowns: "item-override-inherits-negative-reference",
            admiralStamina: "additive-reference",
            admiralHealth: "maximum-only-reference",
            admiralRecipientHealth: "ten-health-per-stamina-reference",
          },
        }),
      },
      assignment: { ...result.assignment, externalNonHealingDeficitAdjustmentMean: 100 },
    };
    expect(shamanHealingDisplayMetrics(capacity, durationSeconds).supportHps).toBe(
      result.assignment.supportHpsMean,
    );
    expect(() =>
      shamanHealingDisplayMetrics(
        {
          ...capacity,
          assignment: {
            ...capacity.assignment,
            finalExternalMissingHealthMean:
              capacity.assignment.finalExternalMissingHealthMean + 101,
          },
        },
        durationSeconds,
      ),
    ).toThrow();
  });
});
