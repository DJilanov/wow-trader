import type { XpPosition } from "./campaign-xp.js";
import type { CampaignQuestChange } from "./campaign.js";

export interface CampaignXpEvent {
  readonly actionId: string;
  readonly questId: number;
  readonly phase: CampaignQuestChange["state"];
  readonly objectiveIndex: number | null;
  readonly title: string;
  readonly before: XpPosition;
  readonly after: XpPosition | null;
  readonly questXp: number;
  readonly combatXp: number;
  readonly minimumLevel: number | null;
  readonly shortfallXp: number;
  readonly status: "projected" | "blocked" | "unknown";
}
