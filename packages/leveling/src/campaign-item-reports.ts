import type { PremadeMember } from "./premade-model.js";
import { CampaignItemLedger, type CampaignItemIndex } from "./campaign-item-ledger.js";
import { campaignItemStateSignature } from "./campaign-items.js";

export function campaignItemsForMember(
  index: CampaignItemIndex,
  member: PremadeMember,
  sourceBuild: number,
): CampaignItemLedger {
  const saved = member.itemHoldings;
  const compatible =
    saved?.sourceBuild === sourceBuild &&
    saved.raceId === (member.raceId ?? null) &&
    saved.classSlug === member.classSlug &&
    saved.signature === campaignItemStateSignature(member.questStates, member.confirmations);
  return new CampaignItemLedger(index, member.questStates, compatible ? saved.minimums : {});
}

export function campaignItemReport(
  ledger: CampaignItemLedger,
  member: Pick<PremadeMember, "raceId" | "classSlug" | "questStates" | "confirmations">,
  sourceBuild: number,
): NonNullable<PremadeMember["itemHoldings"]> {
  return {
    revision: "campaign-items-v1",
    sourceBuild,
    raceId: member.raceId ?? null,
    classSlug: member.classSlug,
    signature: campaignItemStateSignature(member.questStates, member.confirmations),
    minimums: { ...ledger.snapshot() },
  };
}

/** Refresh only item-backed objectives; unrelated kill/interaction progress remains intact. */
export function refreshCampaignItemReadiness(
  index: CampaignItemIndex,
  ledger: CampaignItemLedger,
  states: Record<string, PremadeMember["questStates"][string]>,
  confirmations: Record<string, boolean>,
  objectives: ReadonlyMap<number, ReadonlySet<number>>,
  consumedItems?: ReadonlySet<number>,
): void {
  for (const [questId, requirements] of index.byQuest) {
    const state = states[String(questId)];
    if (state !== "accepted" && state !== "objectives-complete") continue;
    const indices =
      objectives.get(questId) ?? new Set(requirements.map((row) => row.objectiveIndex));
    if (state === "objectives-complete")
      for (const objectiveIndex of indices)
        confirmations[`campaign-objective-${questId}-${objectiveIndex}`] = true;
    const ready = new Set(ledger.readyObjectives(questId));
    for (const objective of new Set(requirements.map((row) => row.objectiveIndex))) {
      const rows = requirements.filter((row) => row.objectiveIndex === objective);
      if (
        rows.every((row) => row.quantity !== null && !row.conflict) ||
        rows.some((row) => consumedItems?.has(row.itemId))
      )
        confirmations[`campaign-objective-${questId}-${objective}`] = ready.has(objective);
    }
    states[String(questId)] = [...indices].every(
      (index) => confirmations[`campaign-objective-${questId}-${index}`],
    )
      ? "objectives-complete"
      : "accepted";
  }
}
