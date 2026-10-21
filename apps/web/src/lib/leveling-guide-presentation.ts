import {
  FOREVER_XP_CURVE,
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
  if (members.some((member) => member.endpoint === null))
    return "Some XP is missing from this estimate. Keep following the quests; update your level before deciding to grind.";
  const extraXp = Math.max(0, ...members.map((member) => member.estimatedCombatXp));
  if (extraXp > 0 && section.missingCombat)
    return "Kill XP is not fully included. Check your level at the next requirement; this is not a request to grind.";
  if (extraXp > 0)
    return `The plan includes up to ${extraXp.toLocaleString("en-US")} extra combat XP at required checkpoints. Skip that work if your actual level is already high enough.`;
  return section.audience === "personal"
    ? "Follow the quests in order. Continue to the next area when its quests are available—no extra grind just to match a suggested level."
    : "Follow the quests and required unlocks. Extra XP work is only needed if someone is below the next entry requirement.";
}
