import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { campaignIncludedLegs } from "./campaign.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { DUNGEON_FIRST_CLEAR_CIRCUIT } from "./dungeon-finish.js";
import {
  FINISH_ROUTE,
  FINISH_DEFERRED,
  FINISH_PROVIDER_REVISION,
  type FinishRouteStep,
} from "./campaign-finish-route.js";
import { campaignZoneName } from "./campaign-geography.js";

export interface CampaignFinishReview {
  readonly revision: "first-clear-tasks-20261101-v1";
  readonly questExportSha256: string;
  readonly providerRevision: string;
  readonly wingIds: readonly string[];
  readonly plannedQuestIds: readonly number[];
  readonly deferred: readonly { readonly questId: number; readonly reason: string }[];
}

const finalLegId = "level-60-finish";
const zones: Readonly<Record<string, string>> = {
  "lower-blackrock": "1428",
  "dire-maul-east": "1444",
  "dire-maul-west": "1444",
  "dire-maul-north": "1444",
  scholomance: "1422",
  "stratholme-live": "1423",
  "stratholme-undead": "1423",
};

function npcForPhase(
  quest: QuestCatalogEntry,
  step: FinishRouteStep,
): QuestCatalogEntry["starts"][number] | null {
  const candidates = (step.phase === "accepted" ? quest.starts : quest.ends).filter(
    (npc) => npc.friendlyToAlliance && (step.inside || npc.positions.length > 0),
  );
  return candidates.length === 1 ? candidates[0]! : null;
}

/** Expand the finish's actual quest phases, keeping the mixed-route branch and saved intro ID. */
export function compileCampaignFinish(plan: CampaignPlan, catalog: QuestCatalog): CampaignPlan {
  if (!plan.dungeonFinish) return plan;
  const intro = plan.actions.find((action) => action.id === `${finalLegId}-dungeon-circuit`);
  const checkpoint = plan.actions.find((action) => action.id === `${finalLegId}-checkpoint`);
  if (!intro || !checkpoint) return plan;
  if (
    catalog.targetBuild !== plan.targetBuild ||
    (plan.sourceArchiveSha256 && catalog.sourceArchiveSha256 !== plan.sourceArchiveSha256) ||
    catalog.providerRevision !== FINISH_PROVIDER_REVISION
  )
    throw new Error("Finish quest catalog does not match its campaign.");
  if (plan.finishCircuitReview) {
    if (plan.finishCircuitReview.questExportSha256 !== catalog.questSha256)
      throw new Error("Rebuild the finish route after changing its quest export.");
    return plan;
  }
  const byId = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const deferred = new Map<number, string>(
    Object.entries(FINISH_DEFERRED).map(([id, reason]) => [Number(id), reason]),
  );
  const wanted = new Set(
    FINISH_ROUTE.flatMap((wing) => wing.steps.flatMap((step) => step.questId ?? [])),
  );
  const included = new Set(campaignIncludedLegs(plan, emptyPremadeProgress()).map((leg) => leg.id));
  const earlier = new Set(
    plan.actions.flatMap((action) =>
      action.legId !== finalLegId && included.has(action.legId)
        ? action.questChanges
            .filter((change) => change.state === "rewarded")
            .map((change) => change.questId)
        : [],
    ),
  );
  for (const id of wanted) {
    const quest = byId.get(id);
    if (!quest || quest.minimumLevel === null || quest.questLevel === null) {
      deferred.set(id, "Quest identity or pickup level is absent from the matched catalog.");
      continue;
    }
    const alliance = 4294967373n;
    if (
      quest.requiredClasses ||
      (quest.requiredRaces && (BigInt(quest.requiredRaces) & alliance) !== alliance) ||
      quest.minimumLevel >= 60
    ) {
      deferred.set(id, "This is not an unrestricted pre-60 party quest.");
      continue;
    }
    if (quest.exclusiveWith.length) {
      deferred.set(id, "Exclusive quest alternatives require a separate selected branch.");
      continue;
    }
    const allowed = new Set([
      "non-outdoor-zone",
      "provided-item-interaction",
      "requiredSourceItems",
      "unresolved-objective-text",
    ]);
    if (quest.unsupportedRequirements.some((requirement) => !allowed.has(requirement))) {
      deferred.set(
        id,
        "Additional quest restrictions require review before this first-clear route can include it.",
      );
      continue;
    }
    const phases = FINISH_ROUTE.flatMap((wing) => wing.steps.filter((step) => step.questId === id));
    if (phases.some((step) => step.phase !== "objectives-complete" && !npcForPhase(quest, step)))
      deferred.set(id, "A unique friendly pickup/return NPC and its location are not established.");
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of wanted) {
      if (deferred.has(id)) continue;
      const quest = byId.get(id)!;
      const available = (parent: number): boolean =>
        earlier.has(parent) || (wanted.has(parent) && !deferred.has(parent));
      if (
        quest.prerequisites.allOf.some((parent) => !available(parent)) ||
        (quest.prerequisites.anyOf.length > 0 &&
          (quest.prerequisites.anyOf.length !== 1 || !available(quest.prerequisites.anyOf[0]!)))
      ) {
        deferred.set(
          id,
          "Its prerequisite chain is not completely prepared in this first-clear route.",
        );
        changed = true;
      }
    }
  }
  const tasks: CampaignAction[] = [];
  const phases = new Map<number, "accepted" | "objectives-complete" | "rewarded">();
  for (const wing of FINISH_ROUTE) {
    const option = DUNGEON_FIRST_CLEAR_CIRCUIT.find((entry) => entry.id === wing.id)!;
    tasks.push({
      ...intro,
      id: `${finalLegId}-${wing.id}-brief`,
      kind: "instructions",
      title: option.name,
      instructions: [option.preparation],
      targetLevel: null,
      location: { zone: zones[wing.id]! },
    });
    for (const [offset, step] of wing.steps.entries()) {
      const quest = step.questId ? byId.get(step.questId) : undefined;
      if (step.questId && deferred.has(step.questId)) continue;
      if (!quest) {
        if (step.text)
          tasks.push({
            ...intro,
            id: `${finalLegId}-${wing.id}-note-${offset}`,
            kind: "instructions",
            title: step.text,
            instructions: [step.text],
            targetLevel: null,
          });
        continue;
      }
      const state = step.phase!;
      if (
        (state === "accepted" && phases.has(quest.questId)) ||
        (state !== "accepted" && !phases.has(quest.questId))
      )
        throw new Error(`Invalid finish quest lifecycle: ${quest.questId}.`);
      const parents = [...quest.prerequisites.allOf, ...quest.prerequisites.anyOf];
      if (
        state === "accepted" &&
        parents.some((id) => !earlier.has(id) && phases.get(id) !== "rewarded")
      )
        throw new Error(`Finish quest ${quest.questId} precedes its prerequisite reward.`);
      const npc = state === "objectives-complete" ? null : npcForPhase(quest, step);
      const point = !step.inside ? npc?.positions[0] : undefined;
      const zone = step.inside ? zones[step.inside]! : (step.zone ?? point?.zone);
      if (!zone) throw new Error(`Finish quest ${quest.questId} has no phase location.`);
      const where = step.inside
        ? `inside ${DUNGEON_FIRST_CLEAR_CIRCUIT.find((entry) => entry.id === step.inside)!.name}`
        : `in ${campaignZoneName(zone)}`;
      const text =
        state === "accepted"
          ? `Talk to ${npc!.name} ${where}. Accept ${quest.title}.`
          : state === "rewarded"
            ? `Talk to ${npc!.name} ${where}. Turn in ${quest.title}.`
            : step.text!;
      const objectives = state === "objectives-complete" ? (step.objectives ?? []) : [null];
      if (!objectives.length)
        throw new Error(`Finish quest ${quest.questId} has no objective slots.`);
      tasks.push({
        ...intro,
        id: `${finalLegId}-${wing.id}-${quest.questId}-${state}`,
        kind: "quests",
        title: `${state === "accepted" ? "Accept" : state === "rewarded" ? "Turn in" : "Complete"} ${quest.title}`,
        instructions: [
          text,
          ...(state === "accepted" && quest.providedItem
            ? [`Keep ${quest.providedItem.name} for this quest.`]
            : []),
        ],
        questChanges: objectives.map((objectiveIndex) => ({
          questId: quest.questId,
          title: quest.title,
          state,
          objectiveIndex,
        })),
        ...(state === "objectives-complete" ? { wholeQuestObjectives: true as const } : {}),
        positions: point
          ? [{ sourceLine: 0, position: { ...point, floor: null, space: "map-percent" } }]
          : [],
        location: { zone, ...(step.inside ? { insideDungeon: step.inside } : {}) },
        targetLevel: null,
        ...(state === "accepted" && parents.length ? { requiredQuestIds: parents } : {}),
      });
      phases.set(quest.questId, state);
    }
  }
  if ([...phases.values()].some((state) => state !== "rewarded"))
    throw new Error("Finish route has an unfinished quest lifecycle.");
  const updatedIntro: CampaignAction = {
    ...intro,
    kind: "instructions",
    targetLevel: null,
    instructions: [
      "BRD is the first run already covered by the preceding chapter. Follow the prepared quest tasks below through the remaining seven wings; preserve completed rewards and keep the same instance when a chain requires an outside return.",
      "Prepare actual keys and all five players' quest items. Check the projected exit and confirm the final level-60 checkpoint from the XP bars shown in game.",
    ],
  };
  const actions = plan.actions.flatMap((action) =>
    action.id === intro.id ? [updatedIntro, ...tasks] : [action],
  );
  return {
    ...plan,
    actions,
    legs: plan.legs.map((leg) =>
      leg.id !== finalLegId
        ? leg
        : {
            ...leg,
            actionIds: actions
              .filter((action) => action.legId === finalLegId)
              .map((action) => action.id),
            questIds: [
              ...new Set(
                tasks.flatMap((action) => action.questChanges.map((change) => change.questId)),
              ),
            ],
          },
    ),
    finishCircuitReview: {
      revision: "first-clear-tasks-20261101-v1",
      questExportSha256: catalog.questSha256,
      providerRevision: catalog.providerRevision,
      wingIds: DUNGEON_FIRST_CLEAR_CIRCUIT.map((wing) => wing.id),
      plannedQuestIds: [...phases.keys()],
      deferred: [...deferred].map(([questId, reason]) => ({ questId, reason })),
    },
  };
}
