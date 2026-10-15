import { z } from "zod";

const id = z.number().int().positive().max(10_000_000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const combatNpcSchema = z
  .object({
    id,
    name: z.string().min(1).max(300),
    minimumLevel: z.number().int().min(1).max(100).nullable(),
    maximumLevel: z.number().int().min(1).max(100).nullable(),
    rank: z.number().int().min(0).max(5).nullable(),
    zoneIds: z.array(id).max(200),
    xpEligibility: z.enum(["assumed", "excluded", "unknown"]),
  })
  .strict()
  .refine(
    (npc) =>
      npc.minimumLevel === null ||
      npc.maximumLevel === null ||
      npc.minimumLevel <= npc.maximumLevel,
    "Invalid creature level range",
  );
export type CombatNpc = z.infer<typeof combatNpcSchema>;

export const combatQuestSchema = z
  .object({
    questId: id,
    creatureIds: z.array(id).max(100),
    itemCreatureIds: z.array(id).max(1000),
    objectiveText: z.array(z.string().max(12000)).max(100),
    onlyCreatureObjectives: z.boolean().default(false),
  })
  .strict();
export type CombatQuestReference = z.infer<typeof combatQuestSchema>;

export const combatPackSchema = z
  .object({
    npcId: id,
    kills: z.number().int().min(1).max(10000),
  })
  .strict();
export const dungeonCombatProfileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,120}$/),
    stopId: z.string().regex(/^[a-z0-9-]{1,120}$/),
    title: z.string().min(1).max(300),
    scope: z.enum(["quest-path", "full-clear"]),
    basis: z.enum(["reference-estimate", "observed"]),
    source: z.string().min(1).max(2000),
    sourceBuild: z.number().int().positive(),
    packs: z.array(combatPackSchema).min(1).max(500),
    dungeonMultiplier: z.number().finite().min(0).max(10),
  })
  .strict()
  .refine(
    (profile) => new Set(profile.packs.map((pack) => pack.npcId)).size === profile.packs.length,
    "Combine duplicate creature entries in a dungeon profile",
  )
  .refine(
    (profile) => profile.packs.reduce((sum, pack) => sum + pack.kills, 0) <= 10000,
    "Dungeon path exceeds its kill budget",
  );
export type DungeonCombatProfile = z.infer<typeof dungeonCombatProfileSchema>;

export const killXpEvidenceSchema = z
  .object({
    npcId: id,
    build: z.number().int().positive(),
    playerLevel: z.number().int().min(1).max(60),
    mobLevel: z.number().int().min(1).max(100),
    partySize: z.number().int().min(1).max(5),
    environment: z.enum(["outdoor", "dungeon"]),
    unrestedXpPerPlayer: z.number().int().min(0).max(1000000),
    partyLevels: z.array(z.number().int().min(1).max(60)).min(1).max(5),
    sampleCount: z.number().int().min(3).max(100000),
    source: z.string().min(1).max(2000),
    contextVerified: z.literal(true),
  })
  .strict()
  .refine(
    (entry) =>
      entry.partyLevels.length === entry.partySize &&
      entry.partyLevels.every((level) => level === entry.playerLevel),
    "Calibration requires a controlled equal-level party",
  );
export type KillXpEvidence = z.infer<typeof killXpEvidenceSchema>;

export const combatDatasetSchema = z
  .object({
    schema: z.literal("forever-combat-reference.v1"),
    targetBuild: z.number().int().positive(),
    publication: z.enum(["private-reference", "authorized"]),
    authorizationNote: z.string().max(2000),
    provider: z
      .object({
        repository: z.string().url(),
        revision: z.string().regex(/^[a-f0-9]{40}$/),
        layer: z.literal("forever-static-with-authored"),
        npcSha256: hash,
        questSha256: hash,
        itemSha256: hash,
        limitations: z.array(z.string().max(1000)).min(1).max(30),
      })
      .strict(),
    npcs: z.array(combatNpcSchema).max(100000),
    quests: z.array(combatQuestSchema).max(30000),
    dungeons: z.array(dungeonCombatProfileSchema).max(100),
    killXpEvidence: z.array(killXpEvidenceSchema).max(10000).default([]),
  })
  .strict()
  .superRefine((data, context) => {
    for (const [name, ids] of [
      ["NPC", data.npcs.map((npc) => npc.id)],
      ["quest", data.quests.map((quest) => quest.questId)],
      ["dungeon profile", data.dungeons.map((profile) => profile.id)],
    ] as const)
      if (new Set<string | number>(ids).size !== ids.length)
        context.addIssue({ code: "custom", message: `Duplicate ${name} identity` });
    if (data.publication === "authorized" && !data.authorizationNote.trim())
      context.addIssue({
        code: "custom",
        message: "Public combat data requires authorization provenance",
      });
    const npcIds = new Set(data.npcs.map((npc) => npc.id));
    const contexts = data.killXpEvidence.map((entry) =>
      [
        entry.build,
        entry.npcId,
        entry.playerLevel,
        entry.mobLevel,
        entry.partySize,
        entry.environment,
      ].join(":"),
    );
    if (new Set(contexts).size !== contexts.length)
      context.addIssue({
        code: "custom",
        message: "Duplicate or conflicting kill XP calibration context",
      });
    if (
      data.killXpEvidence.some(
        (entry) => !npcIds.has(entry.npcId) || entry.build !== data.targetBuild,
      )
    )
      context.addIssue({
        code: "custom",
        message: "Kill XP calibration creature or build does not match this dataset",
      });
    for (const profile of data.dungeons)
      if (profile.packs.some((pack) => !npcIds.has(pack.npcId)))
        context.addIssue({
          code: "custom",
          message: "Dungeon profile references an absent creature",
        });
  });
export type CombatDataset = z.infer<typeof combatDatasetSchema>;

export const combatManifestSchema = z
  .object({
    schema: z.literal("forever-combat-manifest.v1"),
    file: z.string().regex(/^combat-[a-f0-9]{64}\.json$/),
    sha256: hash,
    targetBuild: z.number().int().positive(),
  })
  .strict()
  .refine(
    (manifest) => manifest.file === `combat-${manifest.sha256}.json`,
    "Combat filename/hash mismatch",
  );

export interface CombatObjective {
  readonly questId: number;
  readonly objectiveIndex: number;
  readonly npcIds: readonly number[];
  readonly requiredKills: number | null;
  readonly credit: "shared-kills" | "personal-loot" | "non-combat" | "unknown";
  readonly source: string;
  readonly reason: string | null;
}
export interface CombatActivity {
  readonly id: string;
  readonly actionId: string;
  readonly environment: "outdoor" | "dungeon";
  readonly objectives: readonly CombatObjective[];
  readonly profile: DungeonCombatProfile | null;
  readonly pathId?: string;
  readonly questWide?: boolean;
}
export interface CampaignCombatPlan {
  readonly revision: string;
  readonly sourceRevision: string;
  readonly targetBuild: number;
  readonly npcs: readonly CombatNpc[];
  readonly activities: readonly CombatActivity[];
  readonly notice: string | null;
  readonly killXpEvidence?: readonly KillXpEvidence[];
}

export function combatObjectiveKey(
  objective: Pick<CombatObjective, "questId" | "objectiveIndex">,
): string {
  return `${objective.questId}:${objective.objectiveIndex}`;
}
