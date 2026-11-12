import {
  combatDatasetSchema,
  combatNpcSchema,
  type CombatDataset,
  type CombatNpc,
} from "./combat-model.js";
import { conflictingItemQuantities } from "./combat-item-quantity.js";
import {
  combatNpcMetadataReferenceSchema,
  type CombatNpcMetadataReference,
} from "./combat-npc-metadata.js";

/** Replace only named level-less stubs; retain the source of each metadata field. */
export function supplementCombatNpcMetadata(
  current: CombatDataset,
  references: readonly CombatNpcMetadataReference[],
): CombatDataset {
  const selected = combatNpcMetadataReferenceSchema.array().parse(references);
  const byId = new Map(selected.map((reference) => [reference.npcId, reference]));
  if (byId.size !== selected.length) throw new Error("Duplicate creature metadata reference.");
  const npcs = current.npcs.map((npc) => {
    const reference = byId.get(npc.id);
    if (!reference) return npc;
    if (
      npc.name.normalize("NFKC").trim().toLowerCase() !==
        reference.name.normalize("NFKC").trim().toLowerCase() ||
      npc.minimumLevel !== null ||
      npc.maximumLevel !== null ||
      (npc.rank !== null && npc.rank !== 0) ||
      npc.xpEligibility !== "assumed"
    )
      throw new Error("Creature metadata requires a matching named, level-less reference stub.");
    byId.delete(npc.id);
    return {
      ...npc,
      minimumLevel: reference.minimumLevel,
      maximumLevel: reference.maximumLevel,
      rank: reference.rank,
    };
  });
  if (byId.size) throw new Error("Creature metadata references an absent NPC.");
  return combatDatasetSchema.parse({
    ...current,
    npcs,
    npcMetadataReferences: [...(current.npcMetadataReferences ?? []), ...selected],
  });
}

/** Correct explicitly reviewed provider facts only while the entire old NPC record still matches. */
export function correctCombatNpcMetadata(
  current: CombatDataset,
  corrections: readonly {
    readonly previous: CombatNpc;
    readonly reference: CombatNpcMetadataReference;
  }[],
): CombatDataset {
  const updates = corrections.map((correction) => ({
    previous: combatNpcSchema.parse(correction.previous),
    reference: combatNpcMetadataReferenceSchema.parse(correction.reference),
  }));
  const byId = new Map(updates.map((update) => [update.reference.npcId, update]));
  if (byId.size !== updates.length) throw new Error("Duplicate creature metadata correction.");
  const npcs = current.npcs.map((npc) => {
    const update = byId.get(npc.id);
    if (!update) return npc;
    const { previous, reference } = update;
    if (
      previous.id !== reference.npcId ||
      JSON.stringify(combatNpcSchema.parse(npc)) !== JSON.stringify(previous) ||
      npc.name.normalize("NFKC").trim().toLowerCase() !==
        reference.name.normalize("NFKC").trim().toLowerCase() ||
      npc.xpEligibility !== "assumed" ||
      current.npcMetadataReferences?.some((existing) => existing.npcId === npc.id)
    )
      throw new Error("Creature metadata correction requires the exact unqualified prior NPC.");
    byId.delete(npc.id);
    return {
      ...npc,
      minimumLevel: reference.minimumLevel,
      maximumLevel: reference.maximumLevel,
      rank: reference.rank,
    };
  });
  if (byId.size) throw new Error("Creature metadata correction references an absent NPC.");
  return combatDatasetSchema.parse({
    ...current,
    npcs,
    npcMetadataReferences: [
      ...(current.npcMetadataReferences ?? []),
      ...updates.map((update) => update.reference),
    ],
  });
}

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
  const oldNpcNames = new Map(
    previous.npcs.map((npc) => [npc.id, npc.name.normalize("NFKC").toLowerCase()]),
  );
  const newNpcNames = new Map(
    current.npcs.map((npc) => [npc.id, npc.name.normalize("NFKC").toLowerCase()]),
  );
  const oldItems = historicalItemNames(previous),
    newItems = historicalItemNames(current);
  const sameItemIdentity = (itemId: number): boolean => {
    const before = oldItems.get(itemId),
      after = newItems.get(itemId);
    return before?.size === 1 && after?.size === 1 && [...before].every((name) => after.has(name));
  };
  const drops = new Map(
    (previous.lootDrops ?? [])
      .filter((drop) => {
        const oldNpcName = oldNpcNames.get(drop.npcId);
        const sameNpc = oldNpcName !== undefined && oldNpcName === newNpcNames.get(drop.npcId);
        return sameItemIdentity(drop.itemId) && sameNpc;
      })
      .map((drop) => [`${drop.itemId}:${drop.npcId}`, drop] as const),
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
        if (!sameItemIdentity(item.itemId)) return item;
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
          quantity:
            item.quantity ??
            (conflictingItemQuantities(quest.objectiveText, item.itemName, evidence.quantity).length
              ? null
              : evidence.quantity),
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
        `Captured loot objective and drop facts reused from combat reference ${previousRevision}; corrected provider identities take precedence. Quantities contradicting explicit current objective text are not reused. No recordings or dungeon profiles are inherited.`,
      ],
    },
  });
}
