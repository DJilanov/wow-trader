import type { CampaignAction, CampaignQuestChange } from "./campaign.js";

const key = (change: CampaignQuestChange): string =>
  `${change.questId}:${change.state}:${change.objectiveIndex ?? 0}`;

/** Carry newly selected prerequisite work forward rather than altering the sealed tasks. */
export function carryPrefixPrerequisites(
  earlier: readonly CampaignAction[],
  approved: readonly CampaignAction[],
  tail: readonly CampaignAction[],
): readonly CampaignAction[] {
  if (!tail.length) return [];
  const paid = new Set(approved.flatMap((action) => action.questChanges
    .filter((change) => change.state === "rewarded").map((change) => change.questId)));
  const existingPhases = new Set([...approved, ...tail].flatMap((action) => action.questChanges.map(key)));
  const earlyReturns = new Set(earlier.flatMap((action) => action.questChanges
    .filter((change) => change.state === "rewarded").map((change) => change.questId)));
  const needed = new Set<number>();
  function include(id: number, visiting: ReadonlySet<number>): void {
    if (paid.has(id) || needed.has(id)) return;
    if (visiting.has(id)) throw new Error(`The new prerequisite chain is cyclic at quest ${id}.`);
    const entries = earlier.filter((action) => action.questChanges.some((change) => change.questId === id));
    if (!entries.length) return;
    const next = new Set(visiting).add(id);
    for (const action of entries)
      if (action.questChanges.some((change) => change.questId === id && change.state === "accepted"))
        for (const parent of action.requiredQuestIds ?? []) include(parent, next);
    needed.add(id);
  }
  for (const action of tail) {
    for (const change of action.questChanges) include(change.questId, new Set());
    for (const id of action.requiredQuestIds ?? [])
      if (earlyReturns.has(id)) include(id, new Set());
  }
  return earlier.flatMap((action): readonly CampaignAction[] => {
    const changes = action.questChanges.filter((change) =>
      needed.has(change.questId) && !paid.has(change.questId) && !existingPhases.has(key(change)));
    const collections = action.itemCollections?.filter((item) => needed.has(item.questId) && !paid.has(item.questId));
    const supplies = action.auctionSupplies?.filter((item) => needed.has(item.questId) && !paid.has(item.questId));
    if (!changes.length && !collections?.length && !supplies?.length) return [];
    const whole = changes.length === action.questChanges.length &&
      collections?.length === action.itemCollections?.length && supplies?.length === action.auctionSupplies?.length;
    if (!whole && (action.movement || action.nativeUtilityTags?.length))
      throw new Error(`Review the mixed prerequisite utility step before carrying it forward: ${action.id}.`);
    for (const change of changes) existingPhases.add(key(change));
    const title = changes.map((change) =>
      `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Hand in" : "Complete"} ${change.title}`);
    return [{ ...action, legId: tail[0]!.legId, questChanges: changes,
      ...(whole ? {} : { title: title.join(" · "), instructions: title }),
      ...(collections ? { itemCollections: collections } : {}),
      ...(supplies ? { auctionSupplies: supplies } : {}),
      libraryRequired: true, xpOptional: false,
    }];
  });
}
