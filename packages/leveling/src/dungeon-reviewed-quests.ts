import type { DungeonQuest } from "./dungeon-model.js";

export const DUNGEON_BREADCRUMBS: readonly {
  readonly questId: number;
  readonly destinationQuestId: number;
}[] = [
  { questId: 2925, destinationQuestId: 2924 },
  { questId: 2931, destinationQuestId: 2930 },
];

export const DUNGEON_QUEST_FOLLOWUPS: readonly {
  readonly questId: number;
  readonly parentQuestId: number;
}[] = [{ questId: 2952, parentQuestId: 2951 }];

// Authored QuestieDB e9a67d1a2753a0e64c4c96bf7864788fac7b765f, corroborated by
// client quest records 70205/70450. These outside tasks retain their actual travel.
const reviewed = [
  {
    id: 2925,
    title: "Klockmort's Essentials",
    minimumLevel: 24,
    questLevel: 30,
    pickup: "Mathiel, Darnassus",
    turnin: "Klockmort Spannerspan, Ironforge",
    objective: "Speak with Klockmort Spannerspan in Ironforge.",
    position: { mapId: 1457, x: 59.51, y: 45.38 },
    referenceXp: 250,
  },
  {
    id: 2931,
    title: "Castpipe's Task",
    minimumLevel: 25,
    questLevel: 28,
    pickup: "Gaxim Rustfizzle, Stonetalon Mountains",
    turnin: "Master Mechanic Castpipe, Ironforge",
    objective: "Speak with Master Mechanic Castpipe in Ironforge.",
    position: { mapId: 1442, x: 59.52, y: 67.15 },
    referenceXp: 230,
  },
] as const;

const outsideQuests: readonly DungeonQuest[] = reviewed.map((quest) => ({
  ...quest,
  faction: "alliance",
  classSlug: null,
  raceIds: [],
  restrictionsKnown: true,
  pickupStage: "before",
  objectiveStage: "before",
  outsideObjectiveReviewed: true,
  gate: { kind: "all", gates: [] },
  baseXp: quest.referenceXp,
  shareable: true,
  rewards: { fixed: [], choices: [] },
  requiredItems: [],
  notes: [
    "Take this breadcrumb before accepting its destination quest. Its actual pickup level and travel still apply.",
  ],
  evidence: {
    source:
      "https://github.com/Questie/QuestieDB/tree/e9a67d1a2753a0e64c4c96bf7864788fac7b765f; matching client quest records 70205/70450",
    build: 70205,
    effectiveDate: "2026-11-04",
    status: "reviewed",
  },
  minimumLevelClaims: [
    { value: quest.minimumLevel, source: "Matching client quest records 70205/70450" },
  ],
}));

export const REVIEWED_DUNGEON_QUESTS: readonly DungeonQuest[] = [
  ...outsideQuests,
  {
    id: 2952,
    title: "The Sparklematic 5200!",
    faction: "both",
    classSlug: null,
    raceIds: [],
    restrictionsKnown: true,
    minimumLevel: 25,
    questLevel: 30,
    pickup:
      "The Sparklematic 5200, inside Gnomeregan, after inserting the object and paying its cleaning fee.",
    objective: "Collect the Sparklematic-Wrapped Box from the same console.",
    turnin:
      "The Sparklematic 5200, inside Gnomeregan. Collect the box once; repeatable cleaning variants are separate.",
    position: null,
    pickupStage: "inside",
    objectiveStage: "inside",
    gate: { kind: "quest", questId: 2951, state: "rewarded" },
    referenceXp: 2450,
    baseXp: 2450,
    shareable: true,
    rewards: { fixed: [{ id: 9363, title: "Sparklematic-Wrapped Box" }], choices: [] },
    requiredItems: [],
    notes: [
      "2951 is the input/fee step; 2952 is this console's box reward. Do not also count the 4605/4606 alternatives or repeated cleaning.",
    ],
    evidence: outsideQuests[0]!.evidence,
    minimumLevelClaims: [{ value: 25, source: "Matching client quest records 70205/70450" }],
  },
];
