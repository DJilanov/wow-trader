import type { QuestCatalogPosition } from "./quest-catalog.js";

export interface SleepingBagStop extends QuestCatalogPosition {
  readonly name: string;
}

export interface SleepingBagQuest {
  readonly questId: number;
  readonly title: string;
  readonly questLevel: number;
  readonly previousQuestId: number | null;
}

export const SLEEPING_BAG_ROUTE_SOURCE =
  "https://www.wowhead.com/forever/guide/cozy-sleeping-bag-locations-rewards";

export const SLEEPING_BAG_QUESTS: readonly SleepingBagQuest[] = [
  { questId: 79008, title: "... and that note you found", questLevel: 22, previousQuestId: null },
  { questId: 79192, title: "Stepping Stones", questLevel: 24, previousQuestId: 79008 },
  { questId: 79980, title: "Scramble", questLevel: 24, previousQuestId: 79192 },
  { questId: 79974, title: "Wet Job", questLevel: 32, previousQuestId: 79980 },
  { questId: 79975, title: "Eagle's Fist", questLevel: 32, previousQuestId: 79974 },
  { questId: 79976, title: "This Must Be The Place", questLevel: 32, previousQuestId: 79975 },
];

export const SLEEPING_BAG_STOPS: Readonly<Record<string, SleepingBagStop>> = {
  westfall: { name: "Burned-Out Remains", zone: "1436", x: 37, y: 50 },
  barrens: { name: "Burned-Out Remains / Nailed Plank", zone: "1413", x: 46, y: 74 },
  trail: { name: "Camp trail", zone: "1442", x: 50.9, y: 52.3 },
  camp: { name: "Pocket Litter", zone: "1442", x: 40.6, y: 52.4 },
  dirt: { name: "Mound of Dirt", zone: "1442", x: 39.6, y: 49.8 },
  dam: { name: "Carved Figurine", zone: "1432", x: 49.4, y: 12.9 },
  wall: { name: "Thoradin's Wall cart", zone: "1424", x: 87.3, y: 49.6 },
};
