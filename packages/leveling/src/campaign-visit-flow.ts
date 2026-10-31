import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { campaignDungeonQuest } from "./campaign-dungeon-reference.js";
import { getCampaignReferenceQuest } from "./campaign-reference-quests.js";
import { CAMPAIGN_BRIDGES } from "./campaign-route.js";
import type { DungeonGate } from "./dungeon-model.js";

function parents(gate: DungeonGate | undefined): readonly { questId: number; state: string }[] {
  if (!gate) return [];
  if (gate.kind === "quest") return [gate];
  // Alternative and item gates are not safe grounds for choosing a different route.
  return gate.kind === "all" ? gate.gates.flatMap(parents) : [];
}

/** Batch independent outdoor work by zone without changing quest or native source dependencies. */
export function batchCampaignVisits(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
): CampaignPlan {
  const phase = { accepted: 0, "objectives-complete": 1, rewarded: 2 };
  const sourceSteps = new Map(
    sources.flatMap((source) =>
      source.guide.steps.map((step) => [`${source.guide.chapterId}:${step.id}`, step] as const),
    ),
  );
  const actions = [...plan.actions];
  for (const leg of plan.legs.filter((entry) =>
    ["preparation", "xp-bridge"].includes(entry.kind),
  )) {
    const entries = actions.filter((action) => action.legId === leg.id);
    const firstQuests = CAMPAIGN_BRIDGES.find((entry) => entry.id === leg.id)?.firstQuestIds ?? [];
    const dependencies = entries.map((action, index) => {
      const events = action.questChanges.flatMap((change) =>
        change.state === "accepted"
          ? [
              ...parents(campaignDungeonQuest(change.questId)?.gate),
              ...[
                ...(action.requiredQuestIds ?? []),
                ...(getCampaignReferenceQuest(change.questId)?.prerequisiteIds ?? []),
                ...(plan.library?.choices.find((entry) => entry.questId === change.questId)
                  ?.prerequisiteIds ?? []),
              ].map((questId) => ({ questId, state: "rewarded" })),
            ]
          : [],
      );
      const step = action.source
        ? sourceSteps.get(`${action.source.chapterId}:${action.source.stepId}`)
        : undefined;
      for (const directive of step?.directives ?? []) {
        const state =
          directive.tag === ".isOnQuest"
            ? "accepted"
            : directive.tag === ".isQuestComplete"
              ? "objectives-complete"
              : directive.tag === ".isQuestTurnedIn"
                ? "rewarded"
                : null;
        if (state)
          for (const id of directive.arguments.split(","))
            events.push({ questId: Number(id), state });
      }
      return new Set(
        entries.flatMap((other, otherIndex) => {
          if (index === otherIndex) return [];
          const predecessor = other.questChanges.some(
            (earlier) =>
              action.questChanges.some(
                (change) =>
                  change.questId === earlier.questId && phase[earlier.state] < phase[change.state],
              ) ||
              events.some(
                (event) => event.questId === earlier.questId && event.state === earlier.state,
              ),
          );
          const first =
            action.questChanges.length > 0 &&
            !action.questChanges.some((change) => firstQuests.includes(change.questId)) &&
            other.questChanges.some((change) => firstQuests.includes(change.questId));
          // Unlocated instructions are barriers: their source context cannot be moved safely.
          const barrier =
            ((action.kind === "instructions" && !action.location) ||
              (other.kind === "instructions" && !other.location)) &&
            otherIndex < index;
          const xpAfterWork = action.kind === "xp-check" && other.kind !== "xp-check";
          return predecessor || first || barrier || xpAfterWork ? [otherIndex] : [];
        }),
      );
    });
    const start = actions.findIndex((action) => action.legId === leg.id);
    if (start < 0) continue;
    let current = actions
      .slice(0, start)
      .reverse()
      .find((action) => action.location)?.location?.zone;
    const emitted = new Set<number>(),
      ordered: CampaignAction[] = [];
    while (ordered.length < entries.length) {
      const ready = entries.flatMap((action, index) =>
        !emitted.has(index) && [...dependencies[index]!].every((parent) => emitted.has(parent))
          ? [{ action, index }]
          : [],
      );
      ready.sort((left, right) => {
        const distance = (action: CampaignAction): number =>
          current && action.location
            ? (campaignGroundJourney(current, action.location.zone)?.length ?? Infinity)
            : 0;
        return distance(left.action) - distance(right.action) || left.index - right.index;
      });
      const next = ready[0];
      if (!next) break;
      emitted.add(next.index);
      ordered.push(next.action);
      if (next.action.location) current = next.action.location.zone;
    }
    if (ordered.length !== entries.length)
      throw new Error(
        `Outdoor dependency cycle in ${leg.id}: ${entries
          .flatMap((action, index) =>
            emitted.has(index)
              ? []
              : [
                  `${action.id} <- ${[...dependencies[index]!]
                    .filter((parent) => !emitted.has(parent))
                    .map((parent) => entries[parent]!.id)
                    .join(",")}`,
                ],
          )
          .join("; ")}`,
      );
    actions.splice(start, entries.length, ...ordered);
  }
  return {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
    })),
  };
}
