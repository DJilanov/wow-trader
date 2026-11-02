import { combatDatasetSchema, type CombatDataset } from "./combat-model.js";
import { classicLootReferenceSchema, type ClassicLootReference } from "./loot-classic-source.js";

export interface ClassicLootEnrichment {
  readonly data: CombatDataset;
  readonly stackReferencesAdded: number;
  readonly sharingReferencesAdded: number;
  readonly probabilityReferencesAdded: number;
  readonly missingDropReferencesAdded: number;
}

const sameName = (left: string, right: string): boolean =>
  left.normalize("NFKC").toLowerCase() === right.normalize("NFKC").toLowerCase();

/** Historical field references only; current drop rates, builds and known fields take precedence. */
export function enrichCombatClassicLoot(
  current: CombatDataset,
  input: ClassicLootReference,
  currentSha256: string,
): ClassicLootEnrichment {
  const reference = classicLootReferenceSchema.parse(input);
  if (
    reference.targetBuild !== current.targetBuild ||
    reference.targetCombatSha256 !== currentSha256 ||
    !/^[a-f0-9]{64}$/.test(currentSha256)
  )
    throw new Error("Historical loot reference is scoped to a different combat input.");
  const names = new Map<number, Set<string>>();
  for (const quest of current.quests)
    for (const item of quest.itemObjectives ?? []) {
      if (!item.itemName) continue;
      const values = names.get(item.itemId) ?? new Set<string>();
      values.add(item.itemName.normalize("NFKC").toLowerCase());
      names.set(item.itemId, values);
    }
  const compatibleItem = (id: number, name: string): boolean => {
    const values = names.get(id);
    return values?.size === 1 && values.has(name.normalize("NFKC").toLowerCase());
  };
  const items = new Map(
    reference.items
      .filter((item) => compatibleItem(item.itemId, item.name))
      .map((item) => [item.itemId, item]),
  );
  const npcs = new Map(current.npcs.map((npc) => [npc.id, npc]));
  const drops = new Map(
    reference.drops
      .filter(
        (drop) =>
          items.has(drop.itemId) && sameName(npcs.get(drop.npcId)?.name ?? "", drop.npcName),
      )
      .map((drop) => [`${drop.npcId}:${drop.itemId}`, drop]),
  );
  const capturedPairs = new Set(
    (current.lootDrops ?? []).map((drop) => `${drop.npcId}:${drop.itemId}`),
  );
  const questPairs = new Set(
    current.quests.flatMap((quest) =>
      (quest.itemObjectives ?? []).flatMap((item) =>
        item.provided || item.groundPickup
          ? []
          : item.npcIds.map((npcId) => `${npcId}:${item.itemId}`),
      ),
    ),
  );
  const missing = [...drops.values()].filter(
    (drop) =>
      !capturedPairs.has(`${drop.npcId}:${drop.itemId}`) &&
      questPairs.has(`${drop.npcId}:${drop.itemId}`) &&
      drop.probability !== undefined &&
      drop.questOnly !== undefined,
  );
  const existing = current.historicalLoot;
  if (
    existing &&
    missing.length &&
    ["repository", "revision", "file", "sha256", "sourceBuild"].some(
      (key) =>
        existing.source[key as keyof typeof existing.source] !==
        reference.source[key as keyof typeof reference.source],
    )
  )
    throw new Error(
      "Historical loot sources differ; review the source transition before combining references.",
    );
  const missingDrops = new Map(
    (existing?.drops ?? []).map((drop) => [`${drop.npcId}:${drop.itemId}`, drop]),
  );
  let missingDropReferencesAdded = 0;
  for (const drop of missing) {
    const key = `${drop.npcId}:${drop.itemId}`;
    const previous = missingDrops.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(drop))
      throw new Error("Conflicting historical drop reference for the same creature and item.");
    if (!previous) missingDropReferencesAdded++;
    missingDrops.set(key, drop);
  }
  const missingItemIds = new Set([...missingDrops.values()].map((drop) => drop.itemId));
  const missingItems = new Map(
    [...(existing?.items ?? []), ...items.values()]
      .filter((item) => missingItemIds.has(item.itemId))
      .map((item) => [item.itemId, item]),
  );
  const historicalLoot = missing.length
    ? { ...reference, items: [...missingItems.values()], drops: [...missingDrops.values()] }
    : existing;
  let stackReferencesAdded = 0;
  let sharingReferencesAdded = 0;
  let probabilityReferencesAdded = 0;
  const lootDrops = current.lootDrops?.map((drop) => {
    const source = drops.get(`${drop.npcId}:${drop.itemId}`);
    if (!source) return drop;
    let updated = drop;
    if (
      drop.minimumQuantity === null &&
      drop.maximumQuantity === null &&
      !drop.quantityDistribution &&
      !drop.stackReference
    ) {
      stackReferencesAdded++;
      updated = {
        ...drop,
        minimumQuantity: 1,
        maximumQuantity: 1,
        stackReference: {
          ...reference.source,
          itemId: drop.itemId,
          npcId: drop.npcId,
          lootEntry: source.lootEntry,
          minimumQuantity: 1 as const,
          maximumQuantity: 1 as const,
        },
      };
    }
    if (
      !updated.probabilityReference &&
      source.probability !== undefined &&
      source.questOnly !== undefined &&
      updated.minimumQuantity === 1 &&
      updated.maximumQuantity === 1 &&
      !updated.quantityDistribution?.some((entry) => entry.percent > 0 && entry.quantity !== 1)
    ) {
      probabilityReferencesAdded++;
      updated = {
        ...updated,
        probabilityReference: {
          ...reference.source,
          itemId: drop.itemId,
          npcId: drop.npcId,
          lootEntry: source.lootEntry,
          probability: source.probability,
          questOnly: source.questOnly,
          rateMultiplier: 1 as const,
        },
      };
    }
    return updated;
  });
  const quests = current.quests.map((quest) => ({
    ...quest,
    ...(quest.itemObjectives
      ? {
          itemObjectives: quest.itemObjectives.map((item) => {
            const source = items.get(item.itemId);
            if (!source || item.sharing !== "unknown" || item.provided) return item;
            sharingReferencesAdded++;
            return {
              ...item,
              sharing: (source.flags & 2048) !== 0 ? ("shared-roll" as const) : ("pooled" as const),
              sharingReference: {
                ...reference.source,
                itemId: item.itemId,
                itemFlags: source.flags,
              },
            };
          }),
        }
      : {}),
  }));
  return {
    data: combatDatasetSchema.parse({
      ...current,
      quests,
      ...(lootDrops ? { lootDrops } : {}),
      ...(historicalLoot ? { historicalLoot } : {}),
      provider: {
        ...current.provider,
        limitations: [
          ...new Set([
            ...current.provider.limitations,
            `Historical Classic 1.12 fixed-one stack and item-flag references: ${reference.source.repository}@${reference.source.revision}, ${reference.source.file}, sha256 ${reference.source.sha256}. These field assumptions are not confirmed Forever behavior; existing drop probabilities, capture provenance and build guards are unchanged.`,
            "Historical ungrouped quest-roll probabilities use a baseline rate multiplier of 1 when aggregate samples do not establish quest-eligible attempts. They do not change captured probability fields or establish current Forever tuning.",
            ...(historicalLoot
              ? [
                  "Missing captured creature/item pairs may use separately identified historical fixed-one loot references. No captured probability, sample, source build or timestamp is fabricated; these are not measured Forever rates.",
                ]
              : []),
          ]),
        ],
      },
    }),
    stackReferencesAdded,
    sharingReferencesAdded,
    probabilityReferencesAdded,
    missingDropReferencesAdded,
  };
}
