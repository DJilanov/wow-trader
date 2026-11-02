import {
  FOREVER_XP_CURVE,
  xpToCheckpoint,
  type CampaignGuideSection,
  type CampaignXpMemberForecast,
  type XpPosition,
} from "@wow-trader/leveling";

export function guideMembers(section: CampaignGuideSection): readonly CampaignXpMemberForecast[] {
  return section.audience === "personal"
    ? section.forecast.members.slice(0, 1)
    : section.forecast.members;
}

export function guideBarLabel(position: XpPosition | null): string {
  if (!position) return "Estimate needs an update";
  if (position.level === 60) return "Level 60";
  const percentage = Math.floor((position.currentXp / FOREVER_XP_CURVE[position.level]!) * 100);
  return `Level ${position.level} · ${percentage}%`;
}

export function guideGroupBarLabel(positions: readonly (XpPosition | null)[]): string {
  const labels = positions.map(guideBarLabel);
  if (labels.every((label) => label === labels[0])) return labels[0] ?? "Estimate needs an update";
  if (positions.some((position) => position === null))
    return "Some player estimates need an update";
  const levels = positions.map((position) => position!.level);
  const minimum = Math.min(...levels),
    maximum = Math.max(...levels);
  return minimum === maximum
    ? `Level ${minimum} · different XP bars`
    : `Levels ${minimum}–${maximum}`;
}

export function guideChapterMessage(section: CampaignGuideSection): string {
  const members = guideMembers(section);
  if (section.unavailableStarterPlayers.length > 0)
    return "Set your party's race and class in Settings, or update their XP at the rendezvous. Each character follows their own starter path.";
  if (members.some((member) => member.endpoint === null))
    return "Some XP is missing from this estimate. This chapter needs its quest data or an earlier level gap resolved before its finish can be validated.";
  const gap = guideFundingGap(section);
  if (gap !== null && gap > 0)
    return `${section.audience === "personal" ? "You need" : "The player furthest behind needs"} ${gap.toLocaleString("en-US")} more XP to reach level ${section.targetLevel}. ${section.missingCombat ? "Some required kill XP is still missing from the estimate." : "The route needs more quests here."}`;
  return section.audience === "personal"
    ? "Complete the tasks in order, then continue to the next area."
    : "Complete the tasks together, then continue to the next stop.";
}

export function guideFundingGap(section: CampaignGuideSection): number | null {
  const members = guideMembers(section);
  if (!members.length || members.some((member) => member.endpoint === null)) return null;
  return Math.max(
    0,
    ...members.map(
      (member) =>
        xpToCheckpoint(
          member.endpoint!.level,
          member.endpoint!.currentXp,
          section.targetLevel,
          FOREVER_XP_CURVE,
        ) ?? 0,
    ),
  );
}
