import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const fingerprintSchema = z.string().regex(/^[a-f0-9]{24}$/);

export const questValidationEvidenceCodeSchema = z.enum([
  "named-target-unverified",
  "personal-eligibility-unverified",
  "quest-lifecycle-unverified",
  "pickup-level-conflict",
  "source-gate-conflict",
]);

const partyMemberSchema = z
  .object({
    fingerprint: fingerprintSchema,
    rosterFingerprint: fingerprintSchema.optional(),
    level: z.number().int().min(1).max(100),
    class: z.string().min(1).max(60),
    race: z.string().min(1).max(60),
  })
  .strict();

const partySchema = z
  .object({
    size: z.number().int().min(1).max(5),
    setFingerprint: fingerprintSchema,
    members: z.array(partyMemberSchema).min(1).max(5),
  })
  .strict()
  .refine((party) => party.members.length === party.size, "Party member count is inconsistent.");

const objectiveSchema = z
  .object({
    index: z.number().int().min(1).max(20),
    textSha256: sha256Schema.nullable(),
    fulfilled: z.number().int().min(0).max(1_000_000).nullable(),
    required: z.number().int().min(0).max(1_000_000).nullable(),
    finished: z.boolean().nullable(),
  })
  .strict()
  .refine(
    (objective) =>
      objective.fulfilled === null ||
      objective.required === null ||
      objective.fulfilled <= objective.required,
    "Objective progress exceeds its requirement.",
  );

const snapshotSchema = z
  .object({
    capturedAt: z.number().int().min(1).max(10_000_000_000),
    onQuest: z.boolean().nullable(),
    readyForTurnIn: z.boolean().nullable(),
    rewarded: z.boolean().nullable(),
    availableAtGossip: z.boolean().nullable(),
    objectives: z.array(objectiveSchema).max(20),
    prerequisites: z
      .array(
        z
          .object({
            questId: z.number().int().min(1).max(10_000_000),
            onQuest: z.boolean().nullable(),
            rewarded: z.boolean().nullable(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    target: z
      .object({
        npcId: z.number().int().min(1).max(10_000_000).nullable(),
        fingerprint: fingerprintSchema.optional(),
        name: z.string().min(1).max(200),
        level: z.number().int().min(1).max(100).nullable(),
      })
      .strict()
      .nullable(),
    location: z
      .object({
        mapId: z.number().int().min(0).max(10_000_000).nullable(),
        zone: z.string().min(1).max(200).nullable(),
        subzone: z.string().min(1).max(200).nullable(),
      })
      .strict(),
  })
  .strict();

const signalsSchema = z
  .object({
    accepted: z.boolean(),
    turnedIn: z.boolean(),
    heldTransition: z.boolean(),
    rewardedTransition: z.boolean(),
    objectiveProgress: z.boolean(),
    objectiveCompleted: z.boolean(),
    gossipAvailable: z.boolean(),
    matchingTargetSeen: z.boolean(),
    lootMessageCount: z.number().int().min(0).max(20),
    lootMessageSha256: z.array(sha256Schema).max(20),
  })
  .strict();

export const campaignQuestValidationObservationSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    questId: z.number().int().min(1).max(10_000_000),
    evidenceCode: questValidationEvidenceCodeSchema,
    build: z.number().int().min(1).max(10_000_000),
    release: z.string().min(1).max(100),
    compiler: z.string().min(1).max(100),
    character: z
      .object({
        fingerprint: fingerprintSchema,
        class: z.string().min(1).max(60),
        race: z.string().min(1).max(60),
      })
      .strict(),
    startedAt: z.number().int().min(1).max(10_000_000_000),
    endedAt: z.number().int().min(1).max(10_000_000_000),
    completionReason: z.enum(["manual-stop", "all-stop"]),
    startParty: partySchema,
    endParty: partySchema,
    partyChanged: z.literal(false),
    snapshots: z.array(snapshotSchema).min(2).max(30),
    events: z
      .array(
        z
          .object({
            name: z.enum(["QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED"]),
            questId: z.number().int().min(1).max(10_000_000),
            capturedAt: z.number().int().min(1).max(10_000_000_000),
          })
          .strict(),
      )
      .max(50),
    signals: signalsSchema,
    source: z.string().min(1).max(1000),
    contextVerified: z.literal(true),
  })
  .strict()
  .superRefine((observation, context) => {
    if (observation.endedAt < observation.startedAt)
      context.addIssue({ code: "custom", message: "Session ends before it starts." });
    if (observation.endedAt === observation.startedAt)
      context.addIssue({ code: "custom", message: "Session duration is empty." });
    if (observation.startParty.size !== observation.endParty.size)
      context.addIssue({ code: "custom", message: "Party size changed." });
    if (observation.startParty.setFingerprint !== observation.endParty.setFingerprint)
      context.addIssue({ code: "custom", message: "Party set changed." });
    if (
      observation.startParty.members.some(
        (member, index) => member.fingerprint !== observation.endParty.members[index]?.fingerprint,
      )
    )
      context.addIssue({ code: "custom", message: "Party membership changed." });
    if (observation.startParty.members[0]?.fingerprint !== observation.character.fingerprint)
      context.addIssue({ code: "custom", message: "Player is not the first party member." });
    for (const party of [observation.startParty, observation.endParty]) {
      if (new Set(party.members.map((member) => member.fingerprint)).size !== party.size)
        context.addIssue({ code: "custom", message: "Party members must be distinct." });
      const correlated = party.members.flatMap((member) =>
        member.rosterFingerprint ? [member.rosterFingerprint] : [],
      );
      if (
        correlated.length &&
        (correlated.length !== party.size || new Set(correlated).size !== party.size)
      )
        context.addIssue({
          code: "custom",
          message: "Roster correlation must identify every distinct party member.",
        });
    }
    if (
      observation.startParty.members.some((member, index) => {
        const end = observation.endParty.members[index];
        return (
          member.rosterFingerprint !== end?.rosterFingerprint ||
          member.class !== end?.class ||
          member.race !== end?.race
        );
      })
    )
      context.addIssue({
        code: "custom",
        message: "Party correlation or character context changed.",
      });
    const own = observation.startParty.members[0];
    if (own?.class !== observation.character.class || own?.race !== observation.character.race)
      context.addIssue({ code: "custom", message: "Character does not match the party context." });
    for (const [index, snapshot] of observation.snapshots.entries()) {
      if (index > 0 && snapshot.capturedAt < observation.snapshots[index - 1]!.capturedAt)
        context.addIssue({ code: "custom", message: "Quest snapshots must be chronological." });
      if (
        new Set(snapshot.objectives.map((objective) => objective.index)).size !==
        snapshot.objectives.length
      )
        context.addIssue({ code: "custom", message: "Objective indexes must be unique." });
      if (
        snapshot.prerequisites &&
        new Set(snapshot.prerequisites.map((quest) => quest.questId)).size !==
          snapshot.prerequisites.length
      )
        context.addIssue({ code: "custom", message: "Prerequisite identities must be unique." });
    }
    if (
      observation.events.some(
        (event) =>
          event.questId !== observation.questId ||
          event.capturedAt < observation.startedAt ||
          event.capturedAt > observation.endedAt,
      )
    )
      context.addIssue({ code: "custom", message: "Quest event is outside the session context." });
    if (
      observation.snapshots.some(
        (snapshot) =>
          snapshot.capturedAt < observation.startedAt || snapshot.capturedAt > observation.endedAt,
      )
    )
      context.addIssue({ code: "custom", message: "Snapshot is outside the session context." });
  });

export const campaignQuestValidationEvidenceSchema = z
  .object({
    schema: z.literal("campaign-quest-validation-evidence.v1"),
    sourceSha256: sha256Schema,
    runtimeBuild: z.number().int().min(1).max(10_000_000),
    observations: z.array(campaignQuestValidationObservationSchema).max(200),
  })
  .strict()
  .superRefine((evidence, context) => {
    const sessionIds = new Set<string>();
    for (const observation of evidence.observations) {
      if (sessionIds.has(observation.sessionId))
        context.addIssue({
          code: "custom",
          message: `Duplicate quest-validation session ${observation.sessionId}.`,
        });
      sessionIds.add(observation.sessionId);
      if (observation.build !== evidence.runtimeBuild)
        context.addIssue({ code: "custom", message: "Observation runtime build is inconsistent." });
    }
  });

export type QuestValidationEvidenceCode = z.infer<typeof questValidationEvidenceCodeSchema>;
export type CampaignQuestValidationObservation = z.infer<
  typeof campaignQuestValidationObservationSchema
>;
export type CampaignQuestValidationEvidence = z.infer<typeof campaignQuestValidationEvidenceSchema>;
