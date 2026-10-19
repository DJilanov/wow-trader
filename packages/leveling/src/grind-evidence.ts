import { z } from "zod";

import { FOREVER_XP_CURVE } from "./westfall.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const xpPositionSchema = z
  .object({
    level: z.number().int().min(1).max(60),
    xp: z.number().int().min(0).max(100_000_000),
    xpMax: z.number().int().min(0).max(100_000_000),
  })
  .strict()
  .refine((position) => position.xp <= position.xpMax, "XP exceeds the level maximum.");

const grindAreaSchema = z
  .object({
    mapId: z.number().int().min(0).max(10_000_000).nullable(),
    zone: z.string().min(1).max(200).nullable(),
    subzone: z.string().min(1).max(200).nullable(),
    instanceId: z.number().int().min(0).max(10_000_000).nullable(),
    instanceType: z.string().min(1).max(60).nullable(),
    capturedAt: z.number().int().min(1).max(10_000_000_000),
  })
  .strict()
  .refine((area) => area.mapId !== null || area.zone !== null, "Area has no location.");

const grindKillMixSchema = z
  .object({
    npcId: z.number().int().min(1).max(10_000_000),
    name: z.string().min(1).max(200),
    level: z.number().int().min(1).max(100),
    count: z.number().int().min(1).max(100_000),
    reportedXp: z.number().int().min(0).max(100_000_000),
    unparsedMessages: z.number().int().min(0).max(100_000),
  })
  .strict();

export const campaignGrindMeasurementSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    checkpointId: z.string().regex(/^[a-z0-9][a-z0-9_:%-]{0,179}$/),
    build: z.number().int().min(1).max(10_000_000),
    release: z.string().min(1).max(100),
    compiler: z.string().min(1).max(100),
    character: z
      .object({
        fingerprint: z.string().regex(/^[a-f0-9]{24}$/),
        class: z.string().min(1).max(60),
        race: z.string().min(1).max(60),
      })
      .strict(),
    startedAt: z.number().int().min(1).max(10_000_000_000),
    endedAt: z.number().int().min(1).max(10_000_000_000),
    start: xpPositionSchema,
    finish: xpPositionSchema,
    xpGained: z.number().int().min(1).max(100_000_000),
    elapsedSeconds: z.number().int().min(1).max(10_000_000),
    activeSeconds: z.number().int().min(1).max(10_000_000),
    combatSeconds: z.number().int().min(0).max(10_000_000),
    party: z
      .object({
        size: z.number().int().min(1).max(5),
        startLevels: z.array(z.number().int().min(1).max(60)).min(1).max(5),
        endLevels: z.array(z.number().int().min(1).max(60)).min(1).max(5),
      })
      .strict(),
    areas: z.array(grindAreaSchema).min(1).max(25),
    killCount: z.number().int().min(1).max(100_000),
    unattributedKillCount: z.number().int().min(0).max(100_000),
    reportedKillXp: z.number().int().min(0).max(100_000_000),
    unparsedKillMessageCount: z.number().int().min(0).max(100_000),
    killMix: z.array(grindKillMixSchema).max(100),
    questTurnIns: z.literal(0),
    deaths: z.number().int().min(0).max(10_000),
    restedAtStart: z.literal(0),
    restedAtEnd: z.literal(0),
    source: z.string().min(1).max(1000),
    contextVerified: z.literal(true),
  })
  .strict()
  .superRefine((measurement, context) => {
    for (const [label, position] of [
      ["start", measurement.start],
      ["finish", measurement.finish],
    ] as const) {
      const expectedMaximum = position.level === 60 ? 0 : FOREVER_XP_CURVE[position.level];
      if (position.xpMax !== expectedMaximum)
        context.addIssue({
          code: "custom",
          message: `${label} XP maximum does not match the audited curve.`,
        });
    }
    if (
      grindMeasurementTotal(measurement.finish) - grindMeasurementTotal(measurement.start) !==
      measurement.xpGained
    )
      context.addIssue({
        code: "custom",
        message: "XP positions do not reconcile with XP gained.",
      });
    if (measurement.endedAt < measurement.startedAt)
      context.addIssue({ code: "custom", message: "Session ends before it starts." });
    if (measurement.activeSeconds > measurement.elapsedSeconds)
      context.addIssue({ code: "custom", message: "Active time exceeds elapsed time." });
    if (measurement.combatSeconds > measurement.activeSeconds)
      context.addIssue({ code: "custom", message: "Combat time exceeds active time." });
    if (
      measurement.party.startLevels.length !== measurement.party.size ||
      measurement.party.endLevels.length !== measurement.party.size
    )
      context.addIssue({ code: "custom", message: "Party level vector has the wrong size." });
    const attributed = measurement.killMix.reduce((total, entry) => total + entry.count, 0);
    if (attributed + measurement.unattributedKillCount !== measurement.killCount)
      context.addIssue({ code: "custom", message: "Kill mix does not reconcile." });
    if (measurement.unattributedKillCount / measurement.killCount > 0.2)
      context.addIssue({ code: "custom", message: "Too many kills lack attribution." });
    if (
      measurement.unparsedKillMessageCount === 0 &&
      measurement.reportedKillXp !== measurement.xpGained
    )
      context.addIssue({ code: "custom", message: "Kill XP does not reconcile with the XP bar." });
  });

export const campaignGrindEvidenceSchema = z
  .object({
    schema: z.literal("campaign-grind-evidence.v1"),
    sourceSha256: sha256Schema,
    measurements: z.array(campaignGrindMeasurementSchema).max(250),
  })
  .strict()
  .superRefine((evidence, context) => {
    const sessions = new Set<string>();
    for (const measurement of evidence.measurements) {
      if (sessions.has(measurement.sessionId))
        context.addIssue({
          code: "custom",
          message: `Duplicate session ${measurement.sessionId}.`,
        });
      sessions.add(measurement.sessionId);
    }
  });

export type CampaignGrindMeasurement = z.infer<typeof campaignGrindMeasurementSchema>;
export type CampaignGrindEvidence = z.infer<typeof campaignGrindEvidenceSchema>;

export function grindMeasurementTotal(position: {
  readonly level: number;
  readonly xp: number;
}): number {
  let total = position.xp;
  for (let level = 1; level < position.level; level++) total += FOREVER_XP_CURVE[level]!;
  return total;
}
