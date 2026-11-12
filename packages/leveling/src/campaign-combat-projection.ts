import { z } from "zod";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignCombatPlan, CombatObjective } from "./combat-model.js";
import { combatObjectiveKey } from "./combat-model.js";
import type { CampaignCombatState } from "./campaign-combat.js";
import type { PremadeMember, PremadeProgress } from "./premade-model.js";
import type { XpPosition } from "./campaign-xp.js";
import { combatActivityPhase } from "./campaign-combat-phase.js";

const key = z.string().regex(/^[1-9]\d{0,7}:[1-9]\d{0,3}$/);
const identifier = z.string().min(1).max(500);
const position = z.object({ level: z.number().int().min(1).max(60),
  currentXp: z.number().int().min(0).max(1_000_000) }).strict();

/** Hypothetical model state; this is never an observation of a player's quest counters. */
export const campaignCombatProjectionSchema = z.object({
  kind: z.literal("projected-combat.v1"),
  afterActionId: identifier,
  model: z.string().min(1).max(10_000),
  settings: z.string().min(1).max(1_000_000),
  party: z.string().min(1).max(1_000_000),
  members: z.array(z.object({
    player: z.number().int().min(1).max(5),
    position,
    maximumPosition: position,
    counters: z.record(key, z.number().int().min(0).max(10_000_000).nullable()),
    definitions: z.record(key, z.string().min(1).max(100_000)),
    paid: z.array(identifier).max(100_000),
    pathKills: z.record(identifier, z.number().int().min(0).max(10_000_000)),
    materialEncounters: z.array(z.number().int().positive()).max(100_000),
    freshInventoryReference: z.boolean(),
  }).strict()).length(5),
}).strict().refine((value) => value.members.every((member, index) =>
  member.player === index + 1 && new Set(member.paid).size === member.paid.length &&
  new Set(member.materialEncounters).size === member.materialEncounters.length &&
  Object.keys(member.counters).length <= 10_000 && Object.keys(member.pathKills).length <= 100_000),
"Combat projections require one ordered state per party member and bounded unique keys");

export type CampaignCombatProjection = z.infer<typeof campaignCombatProjectionSchema>;

export interface CampaignCombatProjectionContext {
  readonly model: string;
  readonly settings: string;
}

export interface CampaignCombatProjectionFrame {
  readonly actions: readonly CampaignAction[];
  readonly member: PremadeMember;
  readonly maximumPosition: XpPosition;
  readonly combat: CampaignCombatPlan | undefined;
  readonly state: CampaignCombatState;
  readonly materialEncounters: ReadonlySet<number>;
  readonly freshInventoryReference: boolean;
}

export interface RestoredCampaignCombatProjection {
  readonly state: CampaignCombatState;
  readonly materialEncounters: Set<number>;
  readonly freshInventoryReference: boolean;
}

function ordered<T>(values: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
}

function partySignature(members: readonly PremadeMember[]): string {
  return JSON.stringify(members.map((member) => ({ level: member.level, currentXp: member.currentXp,
    raceId: member.raceId ?? null, classSlug: member.classSlug, xpNeedsUpdate: member.xpNeedsUpdate,
    questStates: ordered(member.questStates), confirmations: ordered(member.confirmations) })));
}

export function campaignCombatProjectionContext(
  plan: CampaignPlan,
  progress: PremadeProgress,
  settings: {
    readonly lootScenario: string;
    readonly outdoorXpMultiplier: number;
    readonly incidentalKillXpPercent: number;
    readonly outdoorIncidentalKillXpPercent: number;
    readonly acquisitionXpPolicy: string | null;
    readonly personalActionPlayers: Readonly<Record<string, number>>;
  },
): CampaignCombatProjectionContext {
  return { model: JSON.stringify([plan.release, plan.sourceArchiveSha256 ?? null, plan.targetBuild,
    plan.race, plan.leaderClass, plan.combat?.revision ?? null, plan.combat?.sourceRevision ?? null]),
  settings: JSON.stringify({ ...settings, personalActionPlayers: ordered(settings.personalActionPlayers),
    difficultyPolicy: progress.difficultyPolicy, raidGoals: progress.raidGoals,
    dungeonFinish: progress.dungeonFinish, selectedExtras: ordered(progress.selectedExtras),
    selectedBatches: ordered(progress.selectedBatches), guaranteedBundles: ordered(progress.guaranteedBundles) }) };
}

function objectiveDefinition(objective: CombatObjective): string {
  return JSON.stringify({ npcIds: [...objective.npcIds].sort((a, b) => a - b),
    requiredKills: objective.requiredKills, credit: objective.credit,
    quotaConflict: objective.quotaConflict ?? false, loot: objective.loot ?? null,
    combatAccess: objective.combatAccess ?? null });
}

function activeDefinitions(frame: CampaignCombatProjectionFrame): Readonly<Record<string, string>> {
  const definitions = new Map<string, Set<string>>();
  for (const activity of frame.combat?.activities ?? []) for (const objective of activity.objectives) {
    if (frame.member.questStates[String(objective.questId)] !== "accepted") continue;
    const id = combatObjectiveKey(objective), values = definitions.get(id) ?? new Set<string>();
    values.add(objectiveDefinition(objective));
    definitions.set(id, values);
  }
  return Object.fromEntries([...definitions].sort(([left], [right]) => left.localeCompare(right))
    .map(([id, values]) => [id, JSON.stringify([...values].sort())]));
}

export function captureCampaignCombatProjection(
  context: CampaignCombatProjectionContext,
  afterActionId: string,
  frames: readonly CampaignCombatProjectionFrame[],
): CampaignCombatProjection {
  return campaignCombatProjectionSchema.parse({ kind: "projected-combat.v1", afterActionId,
    ...context, party: partySignature(frames.map((frame) => frame.member)),
    members: frames.map((frame, player) => {
      const definitions = activeDefinitions(frame);
      return { player: player + 1,
        position: { level: frame.member.level, currentXp: frame.member.currentXp },
        maximumPosition: frame.maximumPosition, definitions,
        // An absent counter is known zero only inside this already-running model.
        // An actual accepted quest starts with explicit null counters and retains them.
        counters: Object.fromEntries(Object.keys(definitions).map((id) => [id,
          frame.state.counters.has(id) ? frame.state.counters.get(id) : 0])),
        paid: [...frame.state.paid].sort(), pathKills: ordered(Object.fromEntries(frame.state.pathKills)),
        materialEncounters: [...frame.materialEncounters].sort((a, b) => a - b),
        freshInventoryReference: frame.freshInventoryReference,
      };
    }),
  });
}

export function restoreCampaignCombatProjection(
  projection: CampaignCombatProjection,
  context: CampaignCombatProjectionContext,
  frames: readonly CampaignCombatProjectionFrame[],
): readonly RestoredCampaignCombatProjection[] {
  const saved = campaignCombatProjectionSchema.parse(projection);
  if (saved.model !== context.model || saved.settings !== context.settings ||
    saved.party !== partySignature(frames.map((frame) => frame.member)))
    throw new Error("Projected combat state differs from the current route, settings or party progress.");
  return frames.map((frame, player): RestoredCampaignCombatProjection => {
    const snapshot = saved.members[player]!;
    if (snapshot.position.level !== frame.member.level || snapshot.position.currentXp !== frame.member.currentXp ||
      snapshot.maximumPosition.level !== frame.maximumPosition.level ||
      snapshot.maximumPosition.currentXp !== frame.maximumPosition.currentXp ||
      JSON.stringify(snapshot.definitions) !== JSON.stringify(activeDefinitions(frame)) ||
      JSON.stringify(Object.keys(snapshot.counters).sort()) !== JSON.stringify(Object.keys(snapshot.definitions).sort()))
      throw new Error("Projected combat counters differ from the current objective definitions or XP bounds.");
    const activities = frame.combat?.activities ?? [];
    const changesByAction = new Map(frame.actions.map((action) => [action.id, action.questChanges]));
    const paidIds = new Set([...activities.flatMap((activity) => {
      const changes = changesByAction.get(activity.actionId) ?? [];
      return [activity.id, ...changes.filter((change) => change.state === "objectives-complete")
        .map((change) => combatActivityPhase(activity, changes, change).id)];
    }),
      ...(frame.combat?.materialWork ?? []).map((work) => work.id)]);
    const pathKeys = new Set(activities.flatMap((activity) => activity.pathId
      ? [...new Set([...activity.objectives.flatMap((objective) => objective.npcIds),
          ...(activity.profile?.packs.map((pack) => pack.npcId) ?? [])])]
        .map((id) => `${activity.pathId}:${id}`) : []));
    const unknownActivity = snapshot.paid.find((id) => !paidIds.has(id));
    const unknownPath = Object.keys(snapshot.pathKills).find((id) => !pathKeys.has(id));
    const unknownEncounter = snapshot.materialEncounters.find((id) => !frame.combat?.npcs.some((npc) => npc.id === id));
    if (unknownActivity || unknownPath || unknownEncounter)
      throw new Error(`Projected combat state references an unknown activity or path: ${unknownActivity ?? unknownPath ?? unknownEncounter}.`);
    const counters = new Map(frame.state.counters);
    for (const [id, value] of Object.entries(snapshot.counters)) counters.set(id, value);
    return { state: { counters, paid: new Set(snapshot.paid), pathKills: new Map(Object.entries(snapshot.pathKills)) },
      materialEncounters: new Set(snapshot.materialEncounters),
      freshInventoryReference: snapshot.freshInventoryReference };
  });
}
