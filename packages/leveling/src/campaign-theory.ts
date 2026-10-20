import { forecastCampaignXp, type CampaignXpForecastOptions } from "./campaign-xp.js";
import type { CampaignPlan } from "./campaign.js";
import type { PremadeProgress } from "./premade-model.js";
import type { CampaignXpEvent } from "./campaign-xp-event.js";

export interface CampaignTheoryStep extends CampaignXpEvent {
  readonly fastLoot: CampaignXpEvent["after"];
  readonly slowLoot: CampaignXpEvent["after"];
}
export interface CampaignTheoryPlayer {
  readonly player: number;
  readonly steps: readonly CampaignTheoryStep[];
  readonly issues: readonly string[];
  readonly basis: "route-start" | "actual";
}

/** Three deterministic scenarios; bounds describe loot luck, not guaranteed player levels. */
export function forecastCampaignSteps(
  plan: CampaignPlan,
  progress: PremadeProgress,
  options: Pick<
    CampaignXpForecastOptions,
    "fromActionId" | "throughActionId" | "outdoorXpMultiplier"
  > & { readonly basis?: "route-start" | "actual" } = {},
): readonly CampaignTheoryPlayer[] {
  const { basis = "actual", ...forecastOptions } = options;
  const modeled =
    basis === "actual"
      ? progress
      : {
          ...progress,
          members: progress.members.map((member) => ({
            ...member,
            level: 1,
            currentXp: 0,
            xpNeedsUpdate: false,
            questStates: {},
            confirmations: {},
            bundleSlotStates: {},
          })),
        };
  const run = (lootScenario: "fast" | "expected" | "slow"): ReturnType<typeof forecastCampaignXp> =>
    forecastCampaignXp(plan, modeled, {
      ...forecastOptions,
      noAssumedGrinding: true,
      lootScenario,
    });
  const expected = run("expected"),
    fast = run("fast"),
    slow = run("slow");
  const key = (step: CampaignXpEvent): string =>
    `${step.actionId}:${step.questId}:${step.phase}:${step.objectiveIndex ?? 0}`;
  return progress.members.map((_, player): CampaignTheoryPlayer => {
    const index = (sections: typeof expected): Map<string, CampaignXpEvent> =>
      new Map(
        sections
          .flatMap((section) => section.members[player]?.steps ?? [])
          .map((step) => [key(step), step]),
      );
    const early = index(fast),
      late = index(slow);
    return {
      player: player + 1,
      basis,
      steps: expected
        .flatMap((section) => section.members[player]?.steps ?? [])
        .map((step) => ({
          ...step,
          fastLoot: early.get(key(step))?.after ?? null,
          slowLoot: late.get(key(step))?.after ?? null,
        })),
      issues: [
        ...new Set(expected.flatMap((section) => section.members[player]?.evidenceIssues ?? [])),
      ],
    };
  });
}
