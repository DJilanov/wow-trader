import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";

/** Supplement reciprocal item-start identities without replacing any established planning facts. */
export function supplementCombatItemStarts(
  current: CombatDataset,
  imported: CombatDataset,
): CombatDataset {
  if (
    current.targetBuild !== imported.targetBuild ||
    (["repository", "revision", "layer", "npcSha256", "questSha256", "itemSha256"] as const).some(
      (key) => current.provider[key] !== imported.provider[key],
    )
  )
    throw new Error("Item-start supplementation requires the exact same provider and build.");
  const byQuest = new Map(imported.quests.map((quest) => [quest.questId, quest]));
  return combatDatasetSchema.parse({
    ...current,
    quests: current.quests.map((quest) => {
      const startItem = byQuest.get(quest.questId)?.startItem;
      if (
        quest.startItem &&
        (quest.startItem.itemId !== startItem?.itemId || quest.startItem.name !== startItem?.name)
      )
        throw new Error(`Conflicting item-start identity for quest ${quest.questId}.`);
      return startItem ? { ...quest, startItem } : quest;
    }),
  });
}

function historicalItemNames(data: CombatDataset): ReadonlyMap<number, ReadonlySet<string>> {
  const names = new Map<number, Set<string>>();
  for (const quest of data.quests)
    for (const item of quest.itemObjectives ?? []) {
      if (!item.itemName) continue;
      const values = names.get(item.itemId) ?? new Set<string>();
      values.add(item.itemName.normalize("NFKC").toLowerCase());
      names.set(item.itemId, values);
    }
  return names;
}

/** Reuse captured loot facts after a provider upgrade without replacing corrected NPC/quest data. */
export function reuseCombatLootReferences(
  current: CombatDataset,
  previous: CombatDataset,
  previousRevision: string,
): CombatDataset {
  if (current.targetBuild !== previous.targetBuild || !/^[a-f0-9]{64}$/.test(previousRevision))
    throw new Error("Loot enrichment requires a checksummed reference from the same build.");
  const oldQuests = new Map(previous.quests.map((quest) => [quest.questId, quest]));
  const npcs = new Set(current.npcs.map((npc) => npc.id));
  const oldNpcNames = new Map(
    previous.npcs.map((npc) => [npc.id, npc.name.normalize("NFKC").toLowerCase()]),
  );
  const newNpcNames = new Map(
    current.npcs.map((npc) => [npc.id, npc.name.normalize("NFKC").toLowerCase()]),
  );
  const oldItems = historicalItemNames(previous),
    newItems = historicalItemNames(current);
  const drops = new Map(
    (previous.lootDrops ?? [])
      .filter((drop) => npcs.has(drop.npcId))
      .map((drop) => {
        const before = oldItems.get(drop.itemId),
          after = newItems.get(drop.itemId);
        const sameItem =
          before?.size === 1 && after?.size === 1 && [...before].every((name) => after.has(name));
        const sameNpc = oldNpcNames.get(drop.npcId) === newNpcNames.get(drop.npcId);
        if (drop.probabilityReference && (!sameItem || !sameNpc)) {
          const { probabilityReference: _oldContext, ...captured } = drop;
          return [`${drop.itemId}:${drop.npcId}`, captured] as const;
        }
        return [`${drop.itemId}:${drop.npcId}`, drop] as const;
      }),
  );
  for (const drop of current.lootDrops ?? []) drops.set(`${drop.itemId}:${drop.npcId}`, drop);
  const quests = current.quests.map((quest) => {
    const old = oldQuests.get(quest.questId);
    if (!old?.itemObjectives?.length || !quest.itemObjectives?.length) return quest;
    const sameObjectiveOrder =
      JSON.stringify(quest.creatureIds) === JSON.stringify(old.creatureIds) &&
      JSON.stringify(quest.itemObjectives.map((item) => item.itemId)) ===
        JSON.stringify(old.itemObjectives.map((item) => item.itemId));
    return {
      ...quest,
      itemObjectives: quest.itemObjectives.map((item) => {
        const matches = old.itemObjectives!.filter((entry) => entry.itemId === item.itemId);
        if (
          matches.length !== 1 ||
          quest.itemObjectives!.filter((entry) => entry.itemId === item.itemId).length !== 1
        )
          return item;
        const evidence = matches[0]!;
        const provided = item.provided ?? evidence.provided;
        const conflictingIndex =
          item.objectiveIndex !== null &&
          evidence.objectiveIndex !== null &&
          item.objectiveIndex !== evidence.objectiveIndex;
        return {
          ...item,
          quantity: item.quantity ?? evidence.quantity,
          sharing: item.sharing === "unknown" ? evidence.sharing : item.sharing,
          ...(item.sharing === "unknown" && evidence.sharingReference
            ? { sharingReference: evidence.sharingReference }
            : {}),
          objectiveIndex: conflictingIndex
            ? null
            : (item.objectiveIndex ?? (sameObjectiveOrder ? evidence.objectiveIndex : null)),
          ...(provided === undefined ? {} : { provided }),
          npcIds: provided ? [] : item.npcIds,
          ...(!item.vendorEvidence && evidence.vendorEvidence
            ? { vendorEvidence: evidence.vendorEvidence }
            : {}),
          ...(!item.rewardEvidence && evidence.rewardEvidence
            ? { rewardEvidence: evidence.rewardEvidence }
            : {}),
        };
      }),
    };
  });
  return combatDatasetSchema.parse({
    ...current,
    quests,
    lootDrops: [...drops.values()],
    provider: {
      ...current.provider,
      limitations: [
        ...current.provider.limitations,
        `Captured loot objective and drop facts reused from combat reference ${previousRevision}; corrected provider identities take precedence. No recordings or dungeon profiles are inherited.`,
      ],
    },
  });
}
