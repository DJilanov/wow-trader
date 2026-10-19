import { activeCampaignActions, type CampaignPlan } from "./campaign.js";
import { campaignSections, campaignSectionTarget } from "./campaign-sections.js";
import { forecastCampaignXp, type CampaignXpSectionForecast } from "./campaign-xp.js";
import { emptyPremadeProgress, type PremadeProgress } from "./premade-model.js";
import { PREMADE_STOPS, premadeEntryLevel } from "./premade.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { xpToCheckpoint } from "./calculator.js";
import { questEligibility } from "./quest-eligibility.js";
import { estimateGroupCombat } from "./group-combat.js";

export interface CampaignSectionCoverage {
  readonly sectionId: string;
  readonly audience: "leader" | "party";
  readonly referenceEntryLevel: number;
  readonly targetLevel: number;
  readonly goalKind: "next-departure" | "departure" | "chapter-target";
  readonly requiredXp: number | null;
  readonly handInQuestIds: readonly number[];
  readonly availableRewardIds: readonly number[];
  readonly missingRewardIds: readonly number[];
  readonly conflictingMinimumIds: readonly number[];
  readonly questXpByPlayer: readonly number[];
  readonly gapByPlayer: readonly (number | null)[];
  readonly status: "shortfall" | "incomplete" | "blocked" | "reference-covered";
  readonly forecast: CampaignXpSectionForecast;
  readonly combatCreditFraction: number;
}

export function campaignCoverageReady(
  chapters: readonly CampaignSectionCoverage[],
  cumulative: readonly CampaignXpSectionForecast[],
): boolean {
  return (
    chapters.length > 0 &&
    chapters.length === cumulative.length &&
    chapters.every((chapter) => {
      const section = cumulative.find((entry) => entry.sectionId === chapter.sectionId);
      const members =
        chapter.audience === "leader" ? section?.members.slice(0, 1) : section?.members;
      return (
        chapter.status === "reference-covered" &&
        members?.length === (chapter.audience === "leader" ? 1 : 5) &&
        members.every((member) => member.status === "covered")
      );
    }) &&
    cumulative.at(-1)?.members.length === 5 &&
    cumulative.at(-1)!.members.every((member) => member.endpoint?.level === 60)
  );
}

// Independent authoring diagnostics assume earlier actions, not a playable continuous journey.
export function auditCampaignSections(
  plan: CampaignPlan,
  selection: PremadeProgress = emptyPremadeProgress(),
): readonly CampaignSectionCoverage[] {
  const actions = activeCampaignActions(plan, selection);
  const sections = campaignSections(plan, selection);
  const prior = selection.members.map(
    () => ({}) as PremadeProgress["members"][number]["questStates"],
  );
  let levelFloor = 1;
  return sections.map((section, index): CampaignSectionCoverage => {
    const stop = PREMADE_STOPS.find((entry) => entry.id === section.stopId);
    const gate = stop ? premadeEntryLevel(stop, selection, plan.rewardFacts) : section.to;
    const entryLevel: number = Math.max(
      levelFloor,
      section.from,
      section.kind === "dungeon" ? gate : 1,
    );
    const goal = campaignSectionTarget(sections, index, selection, plan.rewardFacts);
    const targetLevel = goal.level;
    const entries = actions.filter((action) => section.actionIds.includes(action.id));
    const progress: PremadeProgress = {
      ...selection,
      members: selection.members.map((member, player) => ({
        ...member,
        level: entryLevel,
        currentXp: 0,
        xpNeedsUpdate: false,
        classSlug: player === 0 ? plan.leaderClass : member.classSlug,
        questStates: { ...prior[player] },
        confirmations: {},
      })),
    };
    const forecast = forecastCampaignXp({ ...plan, actions: entries }, progress).find(
      (entry) => entry.sectionId === section.id,
    )!;
    const handIns = [
      ...new Set(
        entries.flatMap((action) =>
          action.questChanges
            .filter((change) => change.state === "rewarded")
            .map((change) => change.questId),
        ),
      ),
    ];
    const available = handIns.filter((id) =>
      plan.rewardFacts?.some((fact) => fact.questId === id && fact.status === "available"),
    );
    const gaps = forecast.members.map((member) =>
      member.endpoint === null
        ? null
        : xpToCheckpoint(
            member.endpoint.level,
            member.endpoint.currentXp,
            targetLevel,
            FOREVER_XP_CURVE,
          ),
    );
    const relevant = section.kind === "starter" ? forecast.members.slice(0, 1) : forecast.members;
    const relevantGaps = section.kind === "starter" ? gaps.slice(0, 1) : gaps;
    const conflicts = handIns.filter(
      (id) => questEligibility(id, plan.rewardFacts).minimumConflict,
    );
    const status = relevant.some((member) => member.status === "blocked")
      ? "blocked"
      : relevant.some((member) => member.endpoint === null || member.status === "incomplete") ||
          available.length !== handIns.length ||
          conflicts.length
        ? "incomplete"
        : relevantGaps.some((gap) => gap !== null && gap > 0)
          ? "shortfall"
          : "reference-covered";
    for (const action of entries)
      prior.forEach((states, player) => {
        if (action.leaderOnly && player !== 0) return;
        for (const change of action.questChanges) states[String(change.questId)] = change.state;
      });
    // Each section is an independent proof obligation. Outdoor sections advance to their departure
    // target; dungeon sections retain their entry floor so the following world route owns the gap.
    levelFloor = Math.max(levelFloor, targetLevel);
    return {
      sectionId: section.id,
      audience: section.kind === "starter" ? "leader" : "party",
      referenceEntryLevel: entryLevel,
      targetLevel,
      goalKind: goal.kind,
      requiredXp: xpToCheckpoint(entryLevel, 0, targetLevel, FOREVER_XP_CURVE),
      handInQuestIds: handIns,
      availableRewardIds: available,
      missingRewardIds: handIns.filter((id) => !available.includes(id)),
      conflictingMinimumIds: conflicts,
      questXpByPlayer: forecast.members.map(
        (member) => member.referenceQuestXp + member.estimatedQuestXp,
      ),
      gapByPlayer: gaps,
      status,
      forecast,
      combatCreditFraction: estimateGroupCombat({ partySize: 5, soloXpPerKill: null, kills: null })
        .creditFraction,
    };
  });
}
