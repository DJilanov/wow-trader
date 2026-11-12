import type { CampaignAction, CampaignPlan } from "./campaign.js";

export interface CampaignXpPlaceholder {
  readonly targetLevel: number;
  readonly replacementZoneId: number;
  readonly replacementQuestCount: number;
  readonly sourceUrl: string;
}

export const RIVERGLADES_XP_PLACEHOLDER = {
  targetLevel: 37,
  replacementZoneId: 16591,
  replacementQuestCount: 5,
  sourceUrl: "https://www.wowhead.com/forever/zone=16591/riverglades",
} as const satisfies CampaignXpPlaceholder;

/** Owner-requested temporary farm budget; no quest, kill count or reward is inferred. */
export function attachRivergladesXpPlaceholder(plan: CampaignPlan): CampaignPlan {
  if (!plan.sharedQuestsOnly || plan.race !== "human") return plan;
  const id = "riverglades-farm-to-37-placeholder";
  if (plan.actions.some((action) => action.id === id)) return plan;
  const index = plan.actions.findIndex((action) => action.legId === "scarlet-northern-return" &&
    action.kind === "xp-check" && action.targetStopId === "scarlet-monastery");
  const gate = plan.actions[index];
  if (!gate) return plan;
  const placeholder: CampaignAction = {
    id, legId: gate.legId, title: "Farm to level 37 · temporary Riverglades placeholder",
    instructions: [
      "Farm only the XP each character still needs to reach level 37. Stop when everyone is at least level 37; anyone already there needs no extra XP. Stay together and use suitable outdoor mobs near the current route, within four levels of the lowest player.",
      "This is a temporary farming task. Replace it with five Riverglades quests when their names, objectives and rewards are known.",
      "This is each player's remaining gap after the listed quests and party sharing. Do not count the same kills twice. No kill count, duration or Riverglades quest reward is assumed.",
    ],
    questChanges: [], positions: [], source: null, kind: "xp-check", leaderOnly: false,
    targetLevel: RIVERGLADES_XP_PLACEHOLDER.targetLevel, targetStopId: null, raidOnly: false,
    xpPlaceholder: RIVERGLADES_XP_PLACEHOLDER,
  };
  const actions = [...plan.actions.slice(0, index), placeholder, { ...gate,
    instructions: [
      "Get the party ready for Scarlet Monastery. The required entry level follows your dungeon difficulty setting.",
      "The temporary Riverglades task covers each player's remaining XP to level 37. Continue when the whole party meets the selected entry requirement.",
    ],
  }, ...plan.actions.slice(index + 1)];
  return { ...plan, actions, legs: plan.legs.map((leg) => leg.id !== gate.legId ? leg : {
    ...leg, actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
  }) };
}
