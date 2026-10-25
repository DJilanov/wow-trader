import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  paladinHealingDisplayMetrics,
  paladinHealingJobSchema,
  paladinHealingLegacyItemPolicySchema,
  paladinHealingReplySchema,
  paladinHealingResultSchema,
} from "./paladin-healing-simulator.js";

const bytes = readFileSync(
  new URL("./fixtures/paladin-healing-transport.v1.json.gz", import.meta.url),
);
expect(createHash("sha256").update(bytes).digest("hex")).toBe(
  "fe0cf055955415c83c9ca7a59a489d839f03492e54d26c4a07c4444b95853da3",
);
const fixture = z
  .object({
    schema: z.literal("kfc-paladin-healing-transport-fixture.v1"),
    jobs: z.array(z.unknown()).length(2),
    replies: z.array(z.unknown()).length(2),
    noNewSimulationsExecuted: z.literal(true),
    notDefaultPresetQualification: z.literal(true),
  })
  .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
const jobs = fixture.jobs.map((job) => paladinHealingJobSchema.parse(job)),
  replies = fixture.replies.map((reply) => paladinHealingReplySchema.parse(reply));

describe("Paladin healer workspace transport", () => {
  it("retains six actual native item-reference jobs and their complete external ledgers", () => {
    const actualBytes = readFileSync(
      new URL("./fixtures/paladin-legacy-transport.v1.json.gz", import.meta.url),
    );
    expect(createHash("sha256").update(actualBytes).digest("hex")).toBe(
      "c98ca4099567fed74c4d44a3621121bb968f725d479bf2a1e28442fc1dbe14bb",
    );
    const actual = z
      .object({
        schema: z.literal("kfc-paladin-legacy-transport-fixture.v1"),
        cases: z.array(z.object({ job: z.unknown(), reply: z.unknown() })).length(6),
        actualNativeControlsExecuted: z.literal(6),
        defaultPresetQualification: z.literal(false),
      })
      .parse(JSON.parse(gunzipSync(actualBytes).toString("utf8")));
    for (const entry of actual.cases) {
      const job = paladinHealingJobSchema.parse(entry.job),
        reply = paladinHealingReplySchema.parse(entry.reply);
      expect(job).toEqual(entry.job);
      expect(reply).toEqual(entry.reply);
      expect(reply.status).toBe("complete");
      if (reply.status !== "complete") throw new Error("The actual native control failed");
      expect(reply.result.legacyItemsPolicy).toEqual(job.workload.legacyItemsPolicy);
      expect(paladinHealingDisplayMetrics(reply.result).supportHps).toBe(
        reply.result.assignment.supportHpsMean,
      );
    }
  });

  it("validates explicit legacy item references without inventing missing base statistics", () => {
    const policy = {
      schema: "kfc-paladin-legacy-item-policy.v1",
      id: "current-neutral",
      briarwoodSpellPower: 15,
      royalSealHealingPower: 0,
    };
    expect(paladinHealingLegacyItemPolicySchema.parse(policy)).toEqual(policy);
    for (const invalid of [
      { ...policy, briarwoodSpellPower: 44 },
      { ...policy, briarwoodSpellPower: Number.NaN },
      { ...policy, royalSealHealingPower: 44 },
      { ...policy, royalSealHealingPower: null },
      { ...policy, bonusStats: [29] },
      { schema: policy.schema, id: policy.id },
    ])
      expect(paladinHealingLegacyItemPolicySchema.safeParse(invalid).success).toBe(false);
  });

  it("retains both actual full-build native jobs and raw results without rewriting evidence", () => {
    for (const [index, job] of jobs.entries()) {
      expect(job).toEqual(fixture.jobs[index]);
      expect(replies[index]).toEqual(fixture.replies[index]);
      expect(replies[index]?.id).toBe(job.id);
      expect(replies[index]?.status).toBe("complete");
      expect(job.workload.assignmentScoring).toBe("external-demand-v1");
      expect(job.workload.requireFullTalentBuild).toBe(true);
    }
  });

  it("displays useful external support instead of healing self-created resource costs", () => {
    for (const reply of replies) {
      if (reply.status !== "complete") throw new Error("The captured native job failed");
      const before = structuredClone(reply.result),
        metrics = paladinHealingDisplayMetrics(reply.result);
      expect(metrics.effectiveHealingHps).toBe(reply.result.assignment.healthRestoredHpsMean);
      expect(metrics.supportHps).toBe(reply.result.assignment.supportHpsMean);
      expect(metrics.meanMissingHealth).toBe(
        reply.result.assignment.externalMissingHealthSecondsMean / 180,
      );
      expect(metrics.supportHps).toBeLessThan(reply.result.hps);
      expect(metrics.manaRemaining).toBe(reply.result.manaRemainingMean);
      expect(reply.result).toEqual(before);
    }
  });

  it("rejects missing external ledgers, synthetic bonus health and partial talent scope", () => {
    const job = jobs[0]!;
    for (const workload of [
      { ...job.workload, assignmentScoring: undefined },
      { ...job.workload, requireFullTalentBuild: false },
      {
        ...job.workload,
        targets: job.workload.targets.map((target) =>
          target.raidIndex === 0 ? { ...target, maximumHealth: 1100 } : target,
        ),
      },
      {
        ...job.workload,
        targets: job.workload.targets.map((target) => ({ ...target, raidIndex: 0 })),
      },
      { ...job.workload, allowCasterDamage: true },
    ])
      expect(() => paladinHealingJobSchema.parse({ ...job, workload })).toThrow();
    const reply = replies[0]!;
    if (reply.status !== "complete") throw new Error("The captured native job failed");
    expect(() =>
      paladinHealingResultSchema.parse({ ...reply.result, assignment: undefined }),
    ).toThrow();
    expect(() =>
      paladinHealingReplySchema.parse({ ...reply, schema: "kfc-healing-job-result.v1" }),
    ).toThrow();
  });

  it("rejects inflated support, inconsistent ledgers and false publication flags", () => {
    const reply = replies[0]!;
    if (reply.status !== "complete") throw new Error("The captured native job failed");
    for (const result of [
      { ...reply.result, classQualified: true },
      { ...reply.result, publicationAllowed: true },
      {
        ...reply.result,
        assignment: {
          ...reply.result.assignment,
          supportHpsMean: reply.result.assignment.supportHpsMean + 100,
        },
      },
      {
        ...reply.result,
        assignment: {
          ...reply.result.assignment,
          supportHpsMean: reply.result.assignment.supportHpsMean + 100,
          healthRestoredHpsMean: reply.result.assignment.healthRestoredHpsMean + 100,
        },
      },
      { ...reply.result, name: "No declared duration" },
      { ...reply.result, assignment: { ...reply.result.assignment, supportHpsMean: Number.NaN } },
    ])
      expect(() => paladinHealingResultSchema.parse(result)).toThrow();
  });

  it("rejects stale Favor controls, conflicting regions and unsupported friendly-use fields", () => {
    const job = jobs[0]!;
    for (const workload of [
      { ...job.workload, useDivineFavor: false, divineFavorMinimumBaseCost: 300 },
      { ...job.workload, itemArea: "neutral", orbArea: "haunted" },
      { ...job.workload, cooldowns: [{ itemId: 13444, spellId: 15604 }] },
      { ...job.workload, cooldowns: [{ itemId: 13444, targetRaidIndex: 1 }] },
      { ...job.workload, cooldowns: [{ itemId: 4262, targetRaidIndex: 1 }] },
      { ...job.workload, castSetPolicy: {} },
      { ...job.workload, selfSetPolicy: { devoutProcChance: 2 } },
    ])
      expect(() => paladinHealingJobSchema.parse({ ...job, workload })).toThrow();
  });

  it("validates supported item targeting and runtime error responses", () => {
    const job = jobs[0]!;
    expect(
      paladinHealingJobSchema.parse({
        ...job,
        workload: {
          ...job.workload,
          cooldowns: [
            { itemId: 18637, targetRaidIndex: 0, minimumMissingMana: 1500 },
            { itemId: 8346, targetRaidIndex: -1 },
          ],
        },
      }).workload.cooldowns,
    ).toHaveLength(2);
    expect(
      paladinHealingReplySchema.parse({
        schema: "kfc-paladin-healing-job-result.v1",
        id: job.id,
        status: "error",
        error: { code: "INVALID_INPUT", message: "Rejected before execution" },
      }).status,
    ).toBe("error");
    expect(() =>
      paladinHealingReplySchema.parse({
        schema: "kfc-paladin-healing-job-result.v1",
        id: job.id,
        status: "error",
        error: { code: "", message: "" },
      }),
    ).toThrow();
  });
});
