import { z } from "zod";
import { importedStepSchema } from "./guide-archive.js";
import { questCatalogSchema } from "./quest-catalog.js";
import { combatDatasetSchema } from "./combat-model.js";
import { combatBossReferenceSchema } from "./combat-boss-reference.js";
import data from "./campaign-reviewed-narrative-events.json" with { type: "json" };

const directive = importedStepSchema.shape.directives.element;
const action = z.object({
  id: z.string(),
  legId: z.string(),
  title: z.string(),
  kind: z.literal("quests"),
  instructions: z.array(z.string()),
  questChanges: z.array(z.object({
    questId: z.number().int().positive(),
    state: z.enum(["accepted", "objectives-complete", "rewarded"]),
    title: z.string(),
    objectiveIndex: z.number().int().positive().nullable(),
  }).strict()).length(1),
  source: z.object({
    chapterId: z.string(),
    version: z.string(),
    stepId: z.string(),
    conditions: z.object({
      checks: z.array(directive), phases: z.array(directive), optional: z.boolean(),
    }).strict().optional(),
  }).strict(),
  positions: z.array(z.object({ sourceLine: z.number(), position: directive.shape.position.unwrap() }).strict()),
  requiredQuestIds: z.array(z.number().int().positive()).optional(),
  leaderOnly: z.literal(false),
  raidOnly: z.literal(false),
  targetLevel: z.null(),
  targetStopId: z.null(),
  referenceLevel: z.number(),
}).strict();

const proof = z.object({
  quest: questCatalogSchema.shape.quests.element,
  reference: combatDatasetSchema.shape.quests.element,
  kind: z.enum(["nonlethal", "scene", "dialogue", "handoff", "instant-handoff", "escort", "capture", "supplies", "scripted-combat"]),
  eventObjectiveIndices: z.array(z.number().int().positive()).min(1).optional(),
  generatedDungeonId: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
  capture: z.object({
    perPlayerCount: z.number().int().positive(),
    toolItemId: z.number().int().positive(),
    targetName: z.string().min(1),
  }).strict().optional(),
  encounterNpcIds: z.array(z.number().int().positive()),
  encounterNames: z.array(z.string().min(1)),
  requiresFreshStart: z.boolean(),
  prerequisiteIds: z.array(z.number().int().positive()),
  phases: z.array(z.object({ action, step: importedStepSchema }).strict()).min(1),
}).strict().superRefine((entry, context) => {
  if (
    entry.quest.questId !== entry.reference.questId ||
    entry.quest.requiredClasses !== 0 ||
    entry.phases.some((phase) => phase.action.questChanges[0]!.questId !== entry.quest.questId) ||
    entry.encounterNpcIds.length !== entry.encounterNames.length ||
    new Set(entry.encounterNpcIds).size !== entry.encounterNpcIds.length
  ) context.addIssue({ code: "custom", message: "Narrative proof identities or encounter bindings disagree." });
  if (entry.kind === "escort" && (
    !entry.encounterNpcIds.length || !entry.reference.onlyInteractionObjectives ||
    entry.reference.creatureIds.length || entry.reference.itemCreatureIds.length ||
    entry.reference.itemObjectives?.length || entry.reference.killQuotas?.length ||
    entry.phases.map((phase) => phase.action.questChanges[0]!.state).join(",") !==
      "accepted,objectives-complete,rewarded"
  )) context.addIssue({ code: "custom", message: "An escort requires its complete event lifecycle and encounter access." });
  if (entry.kind === "capture" && (
    !entry.capture || entry.capture.toolItemId !== entry.quest.providedItem?.itemId ||
    !entry.encounterNpcIds.length || entry.reference.creatureIds.length ||
    entry.reference.itemCreatureIds.length || entry.reference.itemObjectives?.length ||
    entry.reference.killQuotas?.length || entry.quest.objectives.length ||
    entry.phases.map((phase) => phase.action.questChanges[0]!.state).join(",") !==
      "accepted,objectives-complete,rewarded" ||
    !entry.phases[1]!.step.directives.some((row) => row.tag === ".use" &&
      row.arguments.trim() === String(entry.capture!.toolItemId)) ||
    !entry.phases[1]!.step.directives.some((row) => row.tag === ".target" &&
      row.arguments.trim() === entry.capture!.targetName)
  )) context.addIssue({ code: "custom", message: "A capture needs its supplied tool, personal return quota and full source lifecycle; it is not a kill objective." });
  if (entry.kind === "capture" && entry.capture) {
    const count = /^Bring (\d+|one|two|three|four|five|six|seven|eight|nine|ten) /i.exec(
      entry.reference.objectiveText.join("\n"),
    )?.[1]?.toLowerCase();
    const words: Readonly<Record<string, number>> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    };
    if (!count || (words[count] ?? Number(count)) !== entry.capture.perPlayerCount)
      context.addIssue({ code: "custom", message: "The capture quota differs from the captured quest objective." });
  }
  if (entry.kind !== "capture" && entry.capture)
    context.addIssue({ code: "custom", message: "Capture details belong only to capture programs." });
  if (entry.generatedDungeonId && (entry.kind !== "dialogue" || !entry.encounterNpcIds.length ||
    entry.phases.map(({ action }) => action.questChanges[0]!.state).join(",") !==
      "accepted,objectives-complete,rewarded"))
    context.addIssue({ code: "custom", message: "A generated dungeon dialogue needs its complete captured lifecycle and encounter access." });
  if (entry.kind === "supplies") {
    const items = entry.reference.itemObjectives ?? [];
    const counters = entry.phases.flatMap(({ action }) => action.questChanges
      .filter((change) => change.state === "objectives-complete")
      .map((change) => change.objectiveIndex));
    if (!items.length || entry.reference.creatureIds.length || entry.reference.itemCreatureIds.length ||
      entry.reference.killQuotas?.length || entry.encounterNpcIds.length ||
      items.some((item) => item.quantity === null || item.npcIds.length || item.provided) ||
      counters.length !== items.length || new Set(counters).size !== counters.length ||
      items.some((item) => !counters.includes(item.objectiveIndex)))
      context.addIssue({ code: "custom", message: "A supply program must retain every non-combat personal item counter." });
  }
  if (entry.kind === "scripted-combat") {
    const kills = entry.reference.killQuotas ?? [], events = entry.eventObjectiveIndices ?? [];
    const counters = entry.phases.flatMap(({ action }) => action.questChanges
      .filter((change) => change.state === "objectives-complete")
      .map((change) => change.objectiveIndex));
    if (!kills.length || !events.length || entry.reference.killQuotaConflicts?.length ||
      kills.length !== entry.reference.creatureIds.length ||
      kills.some((kill) => !entry.encounterNpcIds.includes(kill.npcId) ||
        !entry.reference.creatureIds.includes(kill.npcId)) ||
      events.some((index) => kills.some((kill) => kill.objectiveIndex === index)) ||
      new Set(counters).size !== counters.length || counters.length !== kills.length + events.length ||
      [...kills.map((kill) => kill.objectiveIndex), ...events].some((index) => !counters.includes(index)))
      context.addIssue({ code: "custom", message: "A scripted fight needs distinct proved kill and event counters; dialogue cannot add deaths." });
  } else if (entry.eventObjectiveIndices)
    context.addIssue({ code: "custom", message: "Event counter indices belong only to scripted combat programs." });
});

export const NARRATIVE_EVENT_REFERENCE = z.object({
  targetBuild: z.number().int().positive(),
  sourceArchiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
  provider: z.object({
    revision: z.string(), questSha256: z.string(), npcSha256: z.string(),
    itemSha256: z.string(), objectSha256: z.string(),
  }).strict(),
  encounterReferences: z.object({
    source: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    npcs: z.array(combatDatasetSchema.shape.npcs.element),
    bosses: z.array(combatBossReferenceSchema).optional(),
  }).strict(),
  proofs: z.array(proof),
}).parse(data);

export type NarrativeEventProof = z.infer<typeof proof>;
