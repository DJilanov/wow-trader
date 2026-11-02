import type { CampaignAction } from "./campaign.js";
import type { PremadeMember } from "./premade-model.js";
import type { CampaignItemXpEvent } from "./campaign-xp-event.js";
import type { XpPosition } from "./campaign-xp.js";
import type { CampaignItemIndex, CampaignItemLedger } from "./campaign-item-ledger.js";

/** Zero-XP inventory transitions keep counterfactual funding resumes consistent with the main ledger. */
export function campaignItemProgressEvent(
  action: CampaignAction,
  position: XpPosition,
  index: CampaignItemIndex,
  ledger: CampaignItemLedger,
  states: Readonly<PremadeMember["questStates"]>,
  confirmations: Readonly<Record<string, boolean>>,
): CampaignItemXpEvent {
  const itemKeys = new Set(
    [...index.byQuest].flatMap(([questId, rows]) =>
      rows.map((row) => `campaign-objective-${questId}-${row.objectiveIndex}`),
    ),
  );
  return {
    actionId: action.id,
    title: action.title,
    before: position,
    after: position,
    questId: null,
    phase: "items",
    objectiveIndex: null,
    questXp: 0,
    combatXp: 0,
    minimumLevel: null,
    shortfallXp: 0,
    status: "projected",
    itemState: {
      minimums: ledger.snapshot(),
      questStates: Object.fromEntries(
        Object.entries(states).filter(([id]) => index.byQuest.has(Number(id))),
      ),
      confirmations: Object.fromEntries(
        Object.entries(confirmations).filter(
          ([key]) => itemKeys.has(key) || key.startsWith("campaign-item-"),
        ),
      ),
    },
  };
}
