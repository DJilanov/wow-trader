import {
  activeCampaignActions,
  campaignIncludedLegs,
  type CampaignAction,
  type CampaignLeg,
  type CampaignPlan,
} from "./campaign.js";
import type { PremadeProgress } from "./premade-model.js";
import {
  PREMADE_STOPS,
  premadeEntryLevel,
  premadePreparationQuests,
  selectedPremadeQuests,
  getPremadeQuest,
} from "./premade.js";
import { xpToCheckpoint } from "./calculator.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import type { QuestRewardFact } from "./quest-rewards.js";

export interface CampaignSectionArea {
  readonly id: string;
  readonly title: string;
  readonly legIds: readonly string[];
}

// Main questing locations, not a replacement for each action's coordinates or travel instructions.
const outdoorAreas: Readonly<Record<string, string>> = {
  "ironforge-rendezvous": "Dun Morogh",
  "early-party-kills": "Dun Morogh",
  "northern-approach": "Darkshore",
  "defias-unlock": "Westfall",
  "stockade-letter-unlock": "Stormwind",
  "redridge-kill-batch": "Redridge Mountains",
  "duskwood-watch": "Duskwood",
  "wetlands-prerequisites": "Wetlands",
  "wetlands-early-kills": "Wetlands",
  "excavation-approach": "Wetlands",
  "ashenvale-crossing": "Ashenvale",
  "dalaran-approach": "Hillsbrad Foothills",
  "hillsbrad-gnomer": "Hillsbrad & Arathi Highlands",
  "desolace-scarlet-unlock": "Desolace",
  "lonebrow-rfk-preparation": "Thousand Needles",
  "stv-group-batch": "Stranglethorn Vale",
  "scarlet-northern-return": "Hillsbrad Foothills",
  "post-scarlet-east": "Arathi, Alterac & eastern returns",
  "tanaris-rfd-crossing": "Tanaris & Feralas",
  "badlands-uldaman": "Badlands",
  "desolace-maraudon": "Desolace",
  "tanaris-zulfarrak": "Tanaris & The Hinterlands",
  "dustwallow-alcaz": "Tanaris",
  "searing-group-kills": "Searing Gorge",
  "searing-temple-prep": "Tanaris & Temple quest returns",
  "burning-group-kills": "Burning Steppes",
  "burning-onyxia-prep": "Burning Steppes",
  "blackrock-world-returns": "Searing Gorge & Burning Steppes",
  "plaguelands-strath-prep": "Western & Eastern Plaguelands",
  "final-xp-fallback": "Plaguelands",
};

function sectionAreas(legs: readonly CampaignLeg[]): readonly CampaignSectionArea[] {
  const areas: CampaignSectionArea[] = [];
  for (const leg of legs) {
    if (leg.kind === "finish") continue;
    const title = outdoorAreas[leg.id] ?? leg.title;
    const previous = areas.at(-1);
    if (previous?.title === title)
      areas[areas.length - 1] = { ...previous, legIds: [...previous.legIds, leg.id] };
    else areas.push({ id: leg.id, title, legIds: [leg.id] });
  }
  const finish = legs.filter((leg) => leg.kind === "finish");
  if (finish.length)
    areas.push({ id: finish[0]!.id, title: "Level 60 check", legIds: finish.map((leg) => leg.id) });
  return areas;
}

function zoneTitle(areas: readonly CampaignSectionArea[]): string {
  const names = [
    ...new Set(areas.filter((area) => area.title !== "Level 60 check").map((area) => area.title)),
  ];
  const withoutCity = names.filter((name) => name !== "Stormwind" && name !== "Ironforge");
  return (withoutCity.length ? withoutCity : names).join(" → ") || "Level 60 check";
}

export interface CampaignSection {
  readonly id: string;
  readonly title: string;
  readonly from: number;
  readonly to: number;
  readonly kind: "starter" | "zone" | "dungeon" | "finish";
  readonly areas: readonly CampaignSectionArea[];
  readonly legIds: readonly string[];
  readonly actionIds: readonly string[];
  readonly questIds: readonly number[];
  readonly unresolvedQuestIds: readonly number[];
  readonly stopId: CampaignLeg["stopId"];
  readonly planningOnly: boolean;
}

export function campaignSections(
  plan: CampaignPlan,
  progress?: PremadeProgress,
): readonly CampaignSection[] {
  const sections: CampaignSection[] = [];
  const active = progress ? activeCampaignActions(plan, progress) : plan.actions;
  const includedLegs = campaignIncludedLegs(plan, progress);
  let pending: CampaignLeg[] = [];
  function section(
    id: string,
    title: string,
    kind: CampaignSection["kind"],
    legs: readonly CampaignLeg[],
    to: number,
    stopId: CampaignLeg["stopId"],
  ): void {
    const areas = sectionAreas(legs);
    sections.push({
      id,
      title: kind === "zone" || kind === "finish" ? zoneTitle(areas) : title,
      kind,
      areas,
      from: legs[0]!.from,
      to,
      stopId,
      planningOnly: legs.some((leg) => leg.bundleId !== undefined),
      legIds: legs.map((leg) => leg.id),
      actionIds: legs.flatMap((leg) =>
        active.filter((action) => action.legId === leg.id).map((action) => action.id),
      ),
      questIds: [...new Set(legs.flatMap((leg) => leg.questIds))],
      unresolvedQuestIds: [...new Set(legs.flatMap((leg) => leg.unresolvedQuestIds))],
    });
  }
  for (let index = 0; index < includedLegs.length; index++) {
    const leg = includedLegs[index]!;
    if (leg.kind === "starter") {
      section(leg.id, leg.title, "starter", [leg], leg.to, null);
    } else if (leg.kind === "dungeon") {
      if (pending.length) {
        section(
          `prepare-${leg.stopId}`,
          `Prepare for ${leg.title}`,
          "zone",
          pending,
          leg.from,
          leg.stopId,
        );
        pending = [];
      }
      section(leg.id, leg.title, "dungeon", [leg], leg.from, leg.stopId);
    } else pending.push(leg);
  }
  if (pending.length)
    section("finish-leveling", "Finish the journey to 60", "finish", pending, 60, null);
  return sections;
}

export interface CampaignPreparationCheck {
  readonly questId: number;
  readonly title: string;
  readonly stage: "accepted" | "rewarded";
  readonly actionId: string;
  readonly legId: string;
  readonly reportedPlayers: number;
  readonly requiredPlayers: number;
}

export function campaignSectionPreparationChecks(
  plan: CampaignPlan,
  section: CampaignSection,
  progress: PremadeProgress,
): readonly CampaignPreparationCheck[] {
  if (section.kind !== "zone") return [];
  const stop = PREMADE_STOPS.find((entry) => entry.id === section.stopId);
  if (!stop) return [];
  const stages = new Map<number, CampaignPreparationCheck["stage"]>(
    selectedPremadeQuests(stop, progress)
      .filter((choice) => getPremadeQuest(choice.questId)?.pickupStage === "before")
      .map((choice) => [choice.questId, "accepted"]),
  );
  for (const quest of premadePreparationQuests(stop, progress)) stages.set(quest.id, "rewarded");
  const checks: CampaignPreparationCheck[] = [];
  for (const action of campaignSectionActions(plan, section, activeCampaignActions(plan, progress)))
    for (const change of action.questChanges) {
      const stage = stages.get(change.questId);
      if (
        !stage ||
        stage !== change.state ||
        checks.some((check) => check.questId === change.questId)
      )
        continue;
      const members = action.leaderOnly ? progress.members.slice(0, 1) : progress.members;
      checks.push({
        questId: change.questId,
        title: change.title,
        stage,
        actionId: action.id,
        legId: action.legId,
        reportedPlayers: members.filter((member) => {
          const state = member.questStates[String(change.questId)];
          return change.state === "rewarded"
            ? state === "rewarded"
            : state === "accepted" || state === "objectives-complete" || state === "rewarded";
        }).length,
        requiredPlayers: members.length,
      });
    }
  return checks;
}

export function campaignSectionFor(
  plan: CampaignPlan,
  chapterOrLegId: string,
  progress?: PremadeProgress,
): CampaignSection | null {
  return (
    campaignSections(plan, progress).find(
      (section) => section.id === chapterOrLegId || section.legIds.includes(chapterOrLegId),
    ) ?? null
  );
}

export function campaignSectionActions(
  plan: CampaignPlan,
  section: CampaignSection,
  actions: readonly CampaignAction[] = plan.actions,
): readonly CampaignAction[] {
  const ids = new Set(section.legIds);
  return actions.filter((action) => ids.has(action.legId));
}

export interface CampaignXpGap {
  readonly targetLevel: number;
  readonly members: readonly { readonly player: number; readonly remainingXp: number | null }[];
  readonly remainingXp: number | null;
}

export function campaignSectionTarget(
  sections: readonly CampaignSection[],
  index: number,
  progress: PremadeProgress,
  facts: readonly QuestRewardFact[] = [],
): {
  readonly level: number;
  readonly kind: "next-departure" | "departure" | "chapter-target" | "actual-xp";
} {
  const section = sections[index];
  if (!section) throw new Error("Unknown campaign section.");
  if (section.kind === "starter")
    return { level: progress.members[0]?.level ?? 1, kind: "actual-xp" };
  const stop = PREMADE_STOPS.find((entry) => entry.id === section.stopId);
  return {
    level: stop ? premadeEntryLevel(stop, progress, facts) : section.to,
    kind: section.kind === "dungeon" ? "chapter-target" : stop ? "departure" : "chapter-target",
  };
}

export function campaignSectionXpGap(
  section: CampaignSection,
  progress: PremadeProgress,
  facts: readonly QuestRewardFact[] = [],
): CampaignXpGap | null {
  if (section.kind === "dungeon" || section.kind === "starter") return null;
  const stop = PREMADE_STOPS.find((entry) => entry.id === section.stopId);
  const targetLevel = stop ? premadeEntryLevel(stop, progress, facts) : section.to;
  const members = progress.members.map((member, index) => ({
    player: index + 1,
    remainingXp:
      member.level === null || member.currentXp === null || member.xpNeedsUpdate
        ? null
        : xpToCheckpoint(member.level, member.currentXp, targetLevel, FOREVER_XP_CURVE),
  }));
  return {
    targetLevel,
    members,
    remainingXp: members.some((member) => member.remainingXp === null)
      ? null
      : Math.max(...members.map((member) => member.remainingXp!)),
  };
}
