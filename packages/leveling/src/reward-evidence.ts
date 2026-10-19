import { z } from "zod";

import type { QuestRewardFact } from "./quest-rewards.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const fingerprintSchema = z.string().regex(/^[a-f0-9]{24}$/);

const observedRewardLevelSchema = z
  .object({
    level: z.number().int().min(1).max(59),
    xp: z.number().int().min(1).max(100_000_000),
    sampleCount: z.number().int().min(1).max(100),
    sessionIds: z.array(z.string().min(1).max(200)).min(1).max(100),
    characterFingerprints: z.array(fingerprintSchema).min(1).max(100),
    firstCapturedAt: z.number().int().min(1).max(10_000_000_000),
    lastCapturedAt: z.number().int().min(1).max(10_000_000_000),
  })
  .strict()
  .superRefine((observation, context) => {
    if (new Set(observation.sessionIds).size !== observation.sessionIds.length)
      context.addIssue({ code: "custom", message: "Session IDs must be unique." });
    if (
      new Set(observation.characterFingerprints).size !== observation.characterFingerprints.length
    )
      context.addIssue({ code: "custom", message: "Character fingerprints must be unique." });
    if (observation.sessionIds.length > observation.sampleCount)
      context.addIssue({ code: "custom", message: "Session count exceeds sample count." });
    if (observation.characterFingerprints.length > observation.sampleCount)
      context.addIssue({ code: "custom", message: "Character count exceeds sample count." });
    if (observation.lastCapturedAt < observation.firstCapturedAt)
      context.addIssue({ code: "custom", message: "Observation timestamps are inverted." });
  });

export const campaignQuestRewardEvidenceFactSchema = z
  .object({
    questId: z.number().int().min(1).max(10_000_000),
    fullXp: z.number().int().min(1).max(100_000_000).nullable(),
    questLevel: z.number().int().min(1).max(60).nullable(),
    minimumLevel: z.number().int().min(1).max(60).nullable(),
    xpByLevel: z
      .array(
        z
          .object({
            level: z.number().int().min(1).max(59),
            xp: z.number().int().min(1).max(100_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(59),
    sourceUrl: z.string().min(1).max(1000),
    capturedAt: z.string().datetime(),
    status: z.literal("available"),
    evidenceKind: z.literal("observed-forever"),
    observations: z.array(observedRewardLevelSchema).min(1).max(59),
    contextVerified: z.literal(true),
  })
  .strict()
  .superRefine((fact, context) => {
    const levels = fact.xpByLevel.map((entry) => entry.level);
    const observationLevels = fact.observations.map((entry) => entry.level);
    if (new Set(levels).size !== levels.length)
      context.addIssue({ code: "custom", message: "XP levels must be unique." });
    if (new Set(observationLevels).size !== observationLevels.length)
      context.addIssue({ code: "custom", message: "Observation levels must be unique." });
    if (levels.some((level, index) => index > 0 && level <= levels[index - 1]!))
      context.addIssue({ code: "custom", message: "XP levels must be sorted." });
    if (
      observationLevels.some((level, index) => index > 0 && level <= observationLevels[index - 1]!)
    )
      context.addIssue({ code: "custom", message: "Observation levels must be sorted." });
    const observations = new Map(fact.observations.map((entry) => [entry.level, entry.xp]));
    for (const row of fact.xpByLevel)
      if (observations.get(row.level) !== row.xp)
        context.addIssue({
          code: "custom",
          message: `Level ${row.level} XP does not match its observation.`,
        });
    if (
      fact.fullXp !== null &&
      (fact.questLevel === null ||
        !fact.observations.some(
          (entry) => entry.level <= fact.questLevel! + 5 && entry.xp === fact.fullXp,
        ))
    )
      context.addIssue({
        code: "custom",
        message: "Full XP requires a matching observation in the full-reward level band.",
      });
  });

export const campaignQuestRewardEvidenceSchema = z
  .object({
    schema: z.literal("campaign-quest-reward-evidence.v1"),
    sourceSha256: sha256Schema,
    runtimeBuild: z.number().int().min(1).max(10_000_000),
    facts: z.array(campaignQuestRewardEvidenceFactSchema).max(100),
  })
  .strict()
  .superRefine((evidence, context) => {
    const questIds = new Set<number>();
    for (const fact of evidence.facts) {
      if (questIds.has(fact.questId))
        context.addIssue({
          code: "custom",
          message: `Duplicate observed reward fact for quest ${fact.questId}.`,
        });
      questIds.add(fact.questId);
    }
  });

export type CampaignQuestRewardEvidenceFact = z.infer<typeof campaignQuestRewardEvidenceFactSchema>;
export type CampaignQuestRewardEvidence = z.infer<typeof campaignQuestRewardEvidenceSchema>;

export interface MergedQuestRewardEvidence {
  readonly facts: readonly QuestRewardFact[];
  readonly observedQuestIds: readonly number[];
}

/**
 * Applies reviewed current-build observations without promoting historical scaled values to
 * current-build evidence. Exact observed rows always win. Historical rows are discarded once a
 * quest has observations; published Forever rows may remain as compatible current-build context.
 */
export function mergeQuestRewardEvidence(
  facts: readonly QuestRewardFact[],
  evidence: CampaignQuestRewardEvidence,
  runtimeBuild: number,
): MergedQuestRewardEvidence {
  if (!Number.isSafeInteger(runtimeBuild) || runtimeBuild <= 0)
    throw new Error("Reward evidence runtime build is invalid.");
  if (evidence.runtimeBuild !== runtimeBuild)
    throw new Error("Reward evidence belongs to a different runtime build.");
  const result = new Map(facts.map((fact) => [fact.questId, fact]));
  const observedQuestIds: number[] = [];
  for (const observed of evidence.facts) {
    const current = result.get(observed.questId);
    const retainCurrent =
      current?.status === "available" && current.evidenceKind === "published-forever";
    const rows = new Map<number, number>();
    if (retainCurrent) for (const row of current?.xpByLevel ?? []) rows.set(row.level, row.xp);
    for (const row of observed.xpByLevel) rows.set(row.level, row.xp);
    const fullXp =
      observed.fullXp ?? (retainCurrent && current?.fullXp !== undefined ? current.fullXp : null);
    result.set(observed.questId, {
      questId: observed.questId,
      fullXp,
      questLevel: observed.questLevel ?? current?.questLevel ?? null,
      minimumLevel: observed.minimumLevel ?? current?.minimumLevel ?? null,
      xpByLevel: [...rows.entries()]
        .sort(([left], [right]) => left - right)
        .map(([level, xp]) => ({ level, xp })),
      sourceUrl:
        retainCurrent && current
          ? `${observed.sourceUrl}; compatible Forever reference: ${current.sourceUrl}`
          : observed.sourceUrl,
      capturedAt: observed.capturedAt,
      status: "available",
      evidenceKind: "observed-forever",
    });
    observedQuestIds.push(observed.questId);
  }
  return {
    facts: [...result.values()],
    observedQuestIds: observedQuestIds.sort((left, right) => left - right),
  };
}
