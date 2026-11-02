import type { CampaignAction } from "./campaign.js";
import type { CampaignCombatPlan, CampaignMaterialWork, CombatObjective } from "./combat-model.js";
import { combatObjectiveKey } from "./combat-model.js";
import type { CampaignCombatRow, CampaignCombatState } from "./campaign-combat.js";
import type { CampaignItemCollection } from "./campaign-items.js";
import type { PremadeMember } from "./premade-model.js";
import type { CombatXpPosition } from "./combat-xp.js";
import type { LootScenario } from "./quest-loot.js";
import { resolveCombatQuota } from "./combat-loot.js";
import { resolveJointCombatQuota } from "./combat-loot-joint.js";
import { estimatePartyCreatureKills } from "./combat-party-xp.js";
import { estimateBoundedPartyKills, type BoundedCombatKillEstimate } from "./campaign-xp-bounds.js";
import { indexSharedPartyCombat } from "./campaign-shared-combat-index.js";

export interface CampaignMaterialParticipant {
  readonly position: CombatXpPosition;
  readonly maximumPosition?: CombatXpPosition;
  readonly questStates: PremadeMember["questStates"];
  readonly confirmations: Readonly<Record<string, boolean>>;
  readonly minimumItems: ReadonlyMap<number, number>;
  readonly freshInventoryReference: boolean;
  readonly encounteredNpcIds: ReadonlySet<number>;
  readonly state: CampaignCombatState;
  readonly combat: CampaignCombatPlan;
}

export function campaignMaterialTargetNeeded(
  target: CampaignItemCollection,
  states: PremadeMember["questStates"],
  confirmations: Readonly<Record<string, boolean>>,
  minimums: ReadonlyMap<number, number>,
): boolean {
  const state = states[String(target.questId)];
  return (
    !confirmations[target.confirmationKey] &&
    state !== "rewarded" &&
    state !== "objectives-complete" &&
    !(target.objectiveBitmask === 0 && state === "accepted") &&
    (minimums.get(target.itemId) ?? 0) < target.quantity
  );
}

export type CampaignMaterialCombatResult =
  | { readonly status: "not-needed" }
  | { readonly status: "unknown"; readonly reason: string }
  | {
      readonly status: "planned";
      readonly forecasts: readonly {
        readonly xp: number;
        readonly maximumXp?: number;
        readonly rows: readonly CampaignCombatRow[];
        readonly state: CampaignCombatState;
        readonly exit: CombatXpPosition;
        readonly maximumExit?: CombatXpPosition;
      }[];
    };

function questOnly(combat: CampaignCombatPlan, objective: CombatObjective): boolean | null {
  const captures =
    combat.lootDrops?.filter(
      (drop) => drop.itemId === objective.loot?.itemId && drop.npcId === objective.npcIds[0],
    ) ?? [];
  if (captures.length)
    return captures.length === 1 ? (captures[0]!.probabilityReference?.questOnly ?? null) : null;
  const references =
    combat.historicalLoot?.drops.filter(
      (drop) => drop.itemId === objective.loot?.itemId && drop.npcId === objective.npcIds[0],
    ) ?? [];
  return references.length === 1 ? (references[0]!.questOnly ?? null) : null;
}

/** One conditional source workload. Unknown stock or overlap returns no partial XP or counters. */
export function forecastCampaignMaterialCombat(input: {
  readonly action: CampaignAction;
  readonly work: CampaignMaterialWork;
  readonly combat: CampaignCombatPlan;
  readonly participants: readonly CampaignMaterialParticipant[];
  readonly lootScenario: LootScenario;
  readonly xpMultiplier: number;
}): CampaignMaterialCombatResult {
  const { action, work, combat, participants } = input;
  const unknown = (reason: string): CampaignMaterialCombatResult => ({ status: "unknown", reason });
  if (work.actionId !== action.id || !participants.length || participants.length > 5)
    throw new Error("Material work does not match its action or participants.");
  if (
    participants.some(
      (participant) =>
        participant.combat.targetBuild !== combat.targetBuild ||
        participant.combat.revision !== combat.revision ||
        participant.combat.sourceRevision !== combat.sourceRevision,
    )
  )
    throw new Error("Material participant references belong to another combat input.");
  const targets = action.itemCollections ?? [];
  const needs = participants.map((participant) =>
    targets.filter((target) =>
      campaignMaterialTargetNeeded(
        target,
        participant.questStates,
        participant.confirmations,
        participant.minimumItems,
      ),
    ),
  );
  if (needs.every((own) => !own.length)) return { status: "not-needed" };
  if (action.questChanges.some((change) => change.state !== "objectives-complete"))
    return unknown("A use, pickup or hand-in cannot be reordered into a material fight.");
  if (participants.some((participant) => !participant.freshInventoryReference))
    return unknown("Initial material holdings are not known empty in this reference forecast.");
  const keys = needs.map((own) =>
    own
      .map((target) => target.confirmationKey)
      .sort()
      .join(";"),
  );
  if (
    keys.some((key) => key !== keys[0]) ||
    needs.some((own, index) =>
      own.some((target) => (participants[index]!.minimumItems.get(target.itemId) ?? 0) > 0),
    )
  )
    return unknown("Unequal or partial material holdings need a joint inventory model.");
  const selected = work.targets.filter((target) =>
    needs[0]!.some((own) => own.confirmationKey === target.confirmationKey),
  );
  if (
    selected.length !== needs[0]!.length ||
    new Set(selected.map((target) => target.objective.loot?.itemId)).size !== selected.length
  )
    return unknown("Material identities or repeated consumption are unresolved.");
  for (const target of selected) {
    const objective = target.objective;
    const own = targets.find((entry) => entry.confirmationKey === target.confirmationKey)!;
    if (
      own.questId !== objective.questId ||
      own.itemId !== objective.loot?.itemId ||
      own.quantity !== objective.loot.quantity
    )
      return unknown("Material work and its stock target disagree.");
    if (objective.credit !== "personal-loot" || objective.npcIds.length !== 1 || !objective.loot)
      return unknown(objective.reason ?? "A unique self-gather creature is missing.");
    if (
      participants.some((participant) =>
        target.possibleDropNpcIds.some((npcId) => participant.encounteredNpcIds.has(npcId)),
      )
    )
      return unknown(
        "Earlier fights could already have supplied these materials; their remaining inventory is unresolved.",
      );
    const conditional = questOnly(combat, objective);
    if (
      participants.some(
        (participant) => participant.questStates[String(objective.questId)] !== "accepted",
      ) &&
      conditional !== false
    )
      return unknown(
        "A pre-pickup collection needs evidence that its items drop without the quest.",
      );
  }
  if (participants.some((participant) => participant.state.paid.has(work.id)))
    return unknown("This material workload has already been accounted for.");
  const indexes = participants.map((participant) => indexSharedPartyCombat(participant.combat));
  const states = participants.map((participant): CampaignCombatState => ({
    counters: new Map(participant.state.counters),
    paid: new Set(participant.state.paid),
    pathKills: new Map(participant.state.pathKills),
  }));
  const xp = participants.map(() => 0),
    rows = participants.map((): CampaignCombatRow[] => []);
  const maximumXp = participants.map(() => 0);
  let positions = participants.map((participant) => participant.position);
  let maximumPositions = participants.map(
    (participant) => participant.maximumPosition ?? participant.position,
  );
  const bounded = participants.every((participant) => participant.maximumPosition !== undefined);
  const demands = new Map<number, CombatObjective[]>();
  for (const target of selected) {
    const npcId = target.objective.npcIds[0]!;
    demands.set(npcId, [...(demands.get(npcId) ?? []), target.objective]);
  }
  for (const [npcId, materials] of demands) {
    const npc = combat.npcs.find((entry) => entry.id === npcId);
    if (!npc) return unknown("The source material creature has no compatible XP reference.");
    let minimumKills = 0;
    let guaranteedKills: number | null = 0;
    for (const objective of materials) {
      const minimum = resolveCombatQuota(objective, combat, participants.length, input.lootScenario)
        .lootEstimate?.minimumKills;
      if (minimum === undefined) {
        guaranteedKills = null;
        break;
      }
      guaranteedKills = Math.max(guaranteedKills, minimum);
    }
    const activeByPlayer: CombatObjective[][] = [];
    for (const [player, participant] of participants.entries()) {
      const references = indexes[player]!;
      if (
        [...(references.conflictingQuestsByNpc.get(npcId) ?? [])].some(
          (questId) => participant.questStates[String(questId)] === "accepted",
        )
      )
        return unknown("An active source creature has conflicting quest counters.");
      const active = [...(references.objectivesByNpc.get(npcId)?.values() ?? [])].filter(
        (objective) => participant.questStates[String(objective.questId)] === "accepted",
      );
      const pending: CombatObjective[] = [];
      for (const objective of active) {
        if (
          participant.confirmations[
            `campaign-objective-${objective.questId}-${objective.objectiveIndex}`
          ]
        )
          continue;
        const counted = states[player]!.counters.get(combatObjectiveKey(objective));
        const ownMaterial = materials.some(
          (material) =>
            combatObjectiveKey(material) === combatObjectiveKey(objective) &&
            material.loot?.itemId === objective.loot?.itemId &&
            material.loot?.quantity === objective.loot?.quantity &&
            material.loot?.sharing === objective.loot?.sharing,
        );
        if (
          objective.credit === "personal-loot" &&
          ownMaterial &&
          (counted === undefined || counted === 0)
        )
          continue;
        if (
          objective.credit !== "shared-kills" ||
          objective.npcIds.length !== 1 ||
          objective.requiredKills === null ||
          !Number.isSafeInteger(objective.requiredKills) ||
          objective.requiredKills < 1
        )
          return unknown(
            "This material fight overlaps unresolved loot or a non-deterministic quest counter.",
          );
        if (
          counted === null ||
          (counted !== undefined &&
            (!Number.isSafeInteger(counted) || counted < 0 || counted > objective.requiredKills))
        )
          return unknown("An overlapping quest has an unknown remaining kill count.");
        const requiredHere = action.questChanges.some(
          (change) =>
            change.questId === objective.questId &&
            change.objectiveIndex === objective.objectiveIndex,
        );
        const remaining = objective.requiredKills - (counted ?? 0);
        if (
          !requiredHere &&
          remaining > 0 &&
          (guaranteedKills === null || remaining > guaranteedKills)
        )
          return unknown(
            "Material collection can leave a random partial counter for a later quest; its joint inventory is unresolved.",
          );
        if (requiredHere)
          minimumKills = Math.max(minimumKills, objective.requiredKills - (counted ?? 0));
        pending.push(objective);
      }
      activeByPlayer.push(pending);
    }
    const quota =
      materials.length === 1 && minimumKills === 0
        ? resolveCombatQuota(materials[0]!, combat, participants.length, input.lootScenario)
        : resolveJointCombatQuota(
            materials,
            combat,
            participants.length,
            input.lootScenario,
            minimumKills,
          );
    if ("status" in quota && quota.status === "unknown") return unknown(quota.reason);
    if (quota.kills === null)
      return unknown(
        "reason" in quota
          ? (quota.reason ?? "Material drop demand is unresolved.")
          : "Material drop demand is unresolved.",
      );
    const batch = {
      npc,
      kills: quota.kills,
      environment: "outdoor" as const,
      evidence: combat.killXpEvidence ?? [],
      build: combat.targetBuild,
      xpMultiplier: input.xpMultiplier,
    };
    const estimates: readonly BoundedCombatKillEstimate[] = bounded
      ? estimateBoundedPartyKills({
          ...batch,
          positions: positions.map((minimum, player) => ({
            minimum,
            maximum: maximumPositions[player]!,
          })),
        })
      : estimatePartyCreatureKills({ ...batch, positions }).map((estimate) => ({
          ...estimate,
          maximumExit: estimate.exit,
        }));
    if (estimates.some((estimate) => estimate.xp === null || estimate.maximumXp === null))
      return unknown(
        estimates.find((estimate) => estimate.reason)?.reason ??
          "Party progress during material combat is unresolved.",
      );
    const source = `${quota.source ?? materials.map((objective) => objective.source).join("; ")}; conditional fresh-stock source gathering, no outside item transfers; one physical stream including ${minimumKills} required quest kills`;
    for (const [player, estimate] of estimates.entries()) {
      xp[player]! += estimate.xp!;
      maximumXp[player]! += estimate.maximumXp!;
      rows[player]!.push({
        activityId: work.id,
        environment: "outdoor",
        npcId,
        name: npc.name,
        minimumLevel: npc.minimumLevel,
        maximumLevel: npc.maximumLevel,
        kills: quota.kills,
        xp: estimate.xp,
        maximumXp: estimate.maximumXp,
        basis: "reference-estimate",
        source,
        ...("lootEstimate" in quota && quota.lootEstimate
          ? { lootEstimate: quota.lootEstimate }
          : "estimate" in quota
            ? { lootEstimate: quota.estimate }
            : {}),
      });
      for (const objective of activeByPlayer[player]!) {
        const key = combatObjectiveKey(objective);
        states[player]!.counters.set(
          key,
          Math.min(
            objective.requiredKills!,
            (states[player]!.counters.get(key) ?? 0) + quota.kills,
          ),
        );
      }
    }
    positions = estimates.map((estimate) => estimate.exit);
    maximumPositions = estimates.map((estimate) => estimate.maximumExit!);
  }
  return {
    status: "planned",
    forecasts: participants.map((_participant, player) => {
      states[player]!.paid.add(work.id);
      return {
        xp: xp[player]!,
        ...(bounded ? { maximumXp: maximumXp[player]! } : {}),
        rows: rows[player]!,
        state: states[player]!,
        exit: positions[player]!,
        ...(bounded ? { maximumExit: maximumPositions[player]! } : {}),
      };
    }),
  };
}
