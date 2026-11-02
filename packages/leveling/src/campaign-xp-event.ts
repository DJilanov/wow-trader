import type { XpPosition } from "./campaign-xp.js";
import type { CampaignQuestChange } from "./campaign.js";
import type { PremadeMember } from "./premade-model.js";
import type { CampaignXpBoundsTransition } from "./campaign-xp-bounds.js";

interface CampaignXpEventBase {
  readonly xpBounds?: CampaignXpBoundsTransition;
  readonly actionId: string;
  readonly title: string;
  readonly before: XpPosition;
  readonly after: XpPosition | null;
  readonly questXp: number;
  readonly combatXp: number;
  readonly minimumLevel: number | null;
  readonly shortfallXp: number;
  readonly status: "projected" | "blocked" | "unknown";
}

export interface CampaignQuestXpEvent extends CampaignXpEventBase {
  readonly questStateAfter?: PremadeMember["questStates"][string];
  readonly questId: number;
  readonly phase: CampaignQuestChange["state"];
  readonly objectiveIndex: number | null;
}

export interface CampaignItemXpEvent extends CampaignXpEventBase {
  readonly questId: null;
  readonly phase: "items";
  readonly objectiveIndex: null;
  readonly questXp: 0;
  readonly combatXp: 0;
  readonly minimumLevel: null;
  readonly shortfallXp: 0;
  readonly status: "projected";
  readonly itemState: {
    readonly minimums: Readonly<Record<string, number>>;
    readonly questStates: Readonly<PremadeMember["questStates"]>;
    readonly confirmations: Readonly<Record<string, boolean>>;
  };
}

export interface CampaignCombatXpEvent extends CampaignXpEventBase {
  readonly questId: null;
  readonly phase: "combat";
  readonly objectiveIndex: null;
  readonly questXp: 0;
  readonly minimumLevel: null;
  readonly shortfallXp: 0;
  readonly status: "projected";
}

export type CampaignXpEvent = CampaignQuestXpEvent | CampaignCombatXpEvent | CampaignItemXpEvent;
