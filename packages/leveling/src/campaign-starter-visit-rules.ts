import type { ClassSlug } from "./model.js";

export interface CampaignStarterVisitRule {
  readonly classSlug?: ClassSlug;
  readonly questIds: readonly number[];
  readonly triggerQuestId: number;
  readonly minimumLevel?: number;
  readonly afterActionId: string;
  readonly arrivalZone: string;
  readonly replacementPickup?: {
    readonly questId: number;
    readonly npcId: number;
    readonly instructions: readonly string[];
    readonly requirePosition: boolean;
  };
  readonly overrideAccessZone?: true;
  readonly consolidateWestfall?: true;
}

/** Reviewed Human starter visits; quests retain their original phases and identifiers. */
export const CAMPAIGN_STARTER_VISIT_RULES: readonly CampaignStarterVisitRule[] = [
  {
    classSlug: "priest",
    questIds: [5623, 5624],
    triggerQuestId: 5623,
    minimumLevel: 5,
    afterActionId: "start-116-116-source-step-0109",
    arrivalZone: "1429",
  },
  {
    classSlug: "warrior",
    questIds: [1638, 1639, 1640, 1665],
    triggerQuestId: 1638,
    afterActionId: "start-117-117-source-step-0076",
    arrivalZone: "1453",
    replacementPickup: {
      questId: 1638,
      npcId: 5480,
      requirePosition: true,
      instructions: ["Talk to Ilsa Corbin in Stormwind and accept A Warrior's Training."],
    },
  },
  {
    questIds: [6181, 6281, 6261],
    triggerQuestId: 6181,
    afterActionId: "start-117-117-source-step-0084",
    arrivalZone: "1436",
    consolidateWestfall: true,
  },
  {
    questIds: [6661],
    triggerQuestId: 6661,
    afterActionId: "start-117-117-source-step-0050",
    arrivalZone: "1455",
    overrideAccessZone: true,
    replacementPickup: {
      questId: 6661,
      npcId: 12997,
      requirePosition: false,
      instructions: [
        "From Ironforge, enter the Deeprun Tram. Talk to Monty on the Ironforge platform and accept Deeprun Rat Roundup.",
      ],
    },
  },
];
