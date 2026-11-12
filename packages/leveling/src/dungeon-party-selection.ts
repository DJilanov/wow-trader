// Owner-selected additions to the five-player quest route; ordinary checklist opt-outs still work.
const selected = new Set([214, 388, 98815, 2928, 2924, 2904, 2945, 2947, 2948, 2951, 2925, 2931]);

export function isSelectedPartyDungeonQuest(questId: number): boolean {
  return selected.has(questId);
}

/** These two collections are explicitly excluded from the normal full-run assumption. */
export function isDungeonCollectionException(questId: number): boolean {
  return questId === 1486 || questId === 1275;
}
